-- 20261022000000_expense_reversal_and_moving_average.sql
--
-- 1. Cloud Expense Reversal & Sync Protocol:
--    Replaces naive physical deletion with an immutable accounting reversal protocol.
--    Past closed shift reports and historical accounting remain sealed.
--
-- 2. Automated IAS 2 Moving Weighted Average Cost Convergence on Restock:
--    Recalculates product cost_price under IAS 2 (paras 25 & 27) upon applying a purchase receipt:
--    If current stock <= 0, new cost = restock unit cost.
--    Else, new cost = round(((current_stock * current_cost) + (restock_quantity * restock_unit_cost)) / (current_stock + restock_quantity), 2).

-- 1. Alter expenses table
alter table public.expenses
  add column if not exists reversed_at timestamptz default null,
  add column if not exists reversed_by_user_id uuid references public.users(id) default null,
  add column if not exists reversal_reason text default null;

comment on column public.expenses.reversed_at is 'Timestamp when this expense was reversed. NULL means active.';
comment on column public.expenses.reversed_by_user_id is 'Actor who performed the immutable accounting reversal.';
comment on column public.expenses.reversal_reason is 'Mandatory or default audit reason explaining the reversal.';

-- 2. Create sync_apply_expense_reversal
create or replace function public.sync_apply_expense_reversal(payload jsonb, actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense_id uuid := (payload->>'expenseId')::uuid;
  v_reversed_at timestamptz := coalesce((payload->>'reversedAt')::timestamptz, now());
  v_reason text := coalesce(payload->>'reversalReason', 'User requested expense reversal');
  v_business_id uuid;
  v_existing_expense record;
begin
  select business_id into v_business_id from public.users where id = actor_id;
  if v_business_id is null then
    raise exception 'User business not found' using errcode = '22023';
  end if;

  select * into v_existing_expense from public.expenses where id = v_expense_id;
  if v_existing_expense.id is null then
    return jsonb_build_object('status', 'skipped', 'reason', 'not_found', 'id', v_expense_id);
  end if;

  if v_existing_expense.business_id <> v_business_id then
    raise exception 'Cannot reverse expense from another business' using errcode = '42501';
  end if;

  if v_existing_expense.reversed_at is not null then
    return jsonb_build_object('status', 'skipped', 'reason', 'already_reversed', 'id', v_expense_id);
  end if;

  update public.expenses
  set reversed_at = v_reversed_at,
      reversed_by_user_id = actor_id,
      reversal_reason = v_reason
  where id = v_expense_id and business_id = v_business_id;

  insert into public.audit_logs (
    business_id, actor_user_id, action, entity_type, entity_id
  ) values (
    v_business_id, actor_id, 'reverse_expense', 'expenses', v_expense_id
  );

  return jsonb_build_object('status', 'applied', 'id', v_expense_id);
end;
$$;

revoke execute on function public.sync_apply_expense_reversal(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.sync_apply_expense_reversal(jsonb, uuid) to service_role;

-- 3. Update sync_apply_purchase_receipt with IAS 2 moving weighted average calculation
create or replace function public.sync_apply_purchase_receipt(payload jsonb, actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase_id uuid := (payload->>'id')::uuid;
  v_client_id uuid := (payload->>'clientId')::uuid;
  v_branch_id uuid := (payload->>'branchId')::uuid;
  v_created_at_local timestamptz := (payload->>'createdAtLocal')::timestamptz;
  v_existing_id uuid;
  v_item jsonb;
  v_business_id uuid;
  v_item_product_id uuid;
  v_item_quantity integer;
  v_item_unit_cost numeric;
  v_current_stock integer;
  v_current_cost numeric;
  v_new_cost numeric;
begin
  select business_id into v_business_id from public.users where id = actor_id;

  -- Tenant-ownership: branch and supplier must belong to the actor.
  perform public.tenant_owns_entity(v_business_id, 'branches', v_branch_id);
  perform public.tenant_owns_entity(v_business_id, 'suppliers', (payload->>'supplierId')::uuid);

  select id into v_existing_id from purchases where client_id = v_client_id;
  if v_existing_id is not null then
    return jsonb_build_object('status', 'skipped', 'reason', 'already_applied', 'id', v_existing_id);
  end if;

  for v_item in select * from jsonb_array_elements(payload->'items')
  loop
    perform public.tenant_owns_entity(v_business_id, 'products', (v_item->>'productId')::uuid);
  end loop;

  insert into purchases (id, client_id, business_id, branch_id, supplier_id, status, created_by_user_id)
  values (v_purchase_id, v_client_id, v_business_id, v_branch_id, (payload->>'supplierId')::uuid, 'received', actor_id);

  for v_item in select * from jsonb_array_elements(payload->'items')
  loop
    v_item_product_id := (v_item->>'productId')::uuid;
    v_item_quantity := (v_item->>'quantity')::integer;
    v_item_unit_cost := (v_item->>'unitCost')::numeric;

    -- Compute current stock on hand across all movements for this product
    select coalesce(sum(quantity_delta), 0) into v_current_stock
    from public.stock_movements
    where business_id = v_business_id and product_id = v_item_product_id;

    -- Fetch current product cost_price
    select coalesce(cost_price, 0) into v_current_cost
    from public.products
    where id = v_item_product_id and business_id = v_business_id;

    -- IAS 2 Moving weighted average cost calculation
    if v_current_stock <= 0 then
      v_new_cost := round(v_item_unit_cost, 2);
    else
      v_new_cost := round(((v_current_stock * v_current_cost) + (v_item_quantity * v_item_unit_cost)) / (v_current_stock + v_item_quantity), 2);
    end if;

    update public.products
    set cost_price = v_new_cost, version = version + 1, updated_at = now()
    where id = v_item_product_id and business_id = v_business_id;

    insert into purchase_items (purchase_id, product_id, quantity, unit_cost)
    values (
      v_purchase_id, v_item_product_id, v_item_quantity,
      v_item_unit_cost
    );

    insert into stock_movements (
      id, client_id, business_id, branch_id, product_id, quantity_delta, source,
      source_reference_id, created_at_local, created_by_user_id
    ) values (
      gen_random_uuid(), (v_item->>'movementClientId')::uuid, v_business_id, v_branch_id,
      v_item_product_id, v_item_quantity, 'purchase_receipt',
      v_purchase_id, v_created_at_local, actor_id
    );
  end loop;

  return jsonb_build_object('status', 'applied', 'id', v_purchase_id);
end;
$$;

revoke execute on function public.sync_apply_purchase_receipt(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.sync_apply_purchase_receipt(jsonb, uuid) to service_role;

-- 4. Update sync_apply_batch to dispatch 'expense_reversal'
create or replace function public.sync_apply_batch(items jsonb, actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_type text;
  v_payload jsonb;
  v_client_id text;
  v_mutation_id text;
  v_entity_id text;
  v_results jsonb := '[]'::jsonb;
  v_res jsonb;
  v_status text;
  v_authoritative_id text;
  v_error_message text;
  v_error_code text;
begin
  if items is null or jsonb_typeof(items) != 'array' then
    raise exception 'items must be a JSON array' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(items)
  loop
    v_type := v_item->>'type';
    v_payload := v_item->'payload';
    v_client_id := v_item->>'client_id';
    v_mutation_id := coalesce(v_item->>'mutation_id', v_client_id);
    v_entity_id := coalesce(v_item->>'entity_id', v_payload->>'id', v_payload->>'clientId', v_client_id);

    -- Per-item SAVEPOINT isolation via inner begin...exception block
    begin
      case v_type
        when 'sale' then
          v_res := public.sync_apply_sale(v_payload, actor_id);
        when 'stock_adjustment' then
          v_res := public.sync_apply_stock_adjustment(v_payload, actor_id);
        when 'stock_count_submission' then
          v_res := public.sync_apply_stock_count(v_payload, actor_id);
        when 'purchase_receipt' then
          v_res := public.sync_apply_purchase_receipt(v_payload, actor_id);
        when 'customer' then
          v_res := public.sync_apply_customer(v_payload, actor_id);
        when 'product' then
          v_res := public.sync_apply_product(v_payload, actor_id);
        when 'credit_payment' then
          v_res := public.sync_apply_credit_payment(v_payload, actor_id);
        when 'expense' then
          v_res := public.sync_apply_expense(v_payload, actor_id);
        when 'expense_reversal' then
          v_res := public.sync_apply_expense_reversal(v_payload, actor_id);
        when 'supplier' then
          v_res := public.sync_apply_supplier(v_payload, actor_id);
        when 'branch' then
          v_res := public.sync_apply_branch(v_payload, actor_id);
        when 'category' then
          v_res := public.sync_apply_category(v_payload, actor_id);
        else
          raise exception 'Unsupported sync entity type: %', v_type using errcode = '22023';
      end case;

      v_status := case
        when v_res->>'status' = 'conflict' or (v_res->>'conflict')::boolean = true then 'conflict'
        when v_res->>'status' = 'skipped' then 'skipped'
        else 'applied'
      end;
      v_authoritative_id := v_res->>'id';

      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'clientId', v_client_id,
          'mutationId', v_mutation_id,
          'entityId', coalesce(v_authoritative_id, v_entity_id),
          'status', v_status,
          'applied', (v_status = 'applied'),
          'conflict', (v_status = 'conflict'),
          'error', null,
          'errorCode', null
        )
      );
    exception when others then
      get stacked diagnostics
        v_error_message = message_text,
        v_error_code = returned_sqlstate;

      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'clientId', v_client_id,
          'mutationId', v_mutation_id,
          'entityId', v_entity_id,
          'status', 'failed',
          'applied', false,
          'conflict', false,
          'error', v_error_message,
          'errorCode', v_error_code
        )
      );
    end;
  end loop;

  return v_results;
end;
$$;

revoke execute on function public.sync_apply_batch(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.sync_apply_batch(jsonb, uuid) to service_role;

