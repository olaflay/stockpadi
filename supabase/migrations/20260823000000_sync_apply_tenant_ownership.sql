-- Harden the sync_apply_* merge functions with tenant-ownership validation.
--
-- Why: the sync_apply_* functions run as SECURITY DEFINER and are callable
-- only by service_role, which bypasses RLS. Previously each derived
-- v_business_id purely from the actor (users.business_id), but trusted
-- client-supplied global IDs (branch_id, product_id, customer_id, supplier_id,
-- category_id, brand_id) without verifying those rows belong to the actor's
-- own business. Because the foreign keys are plain global-PK references (not
-- composite with business_id), and inventory_stock_rollup aggregates purely on
-- (product_id, branch_id), a caller could post a sale/adjustment against
-- another tenant's branch/product UUID and decrement that tenant's stock while
-- attributing the movement to their own business — a cross-tenant data-
-- corruption primitive. The sync-push Edge Function's branch check also only
-- applies to WORKERs; BUSINESS_OWNERs were never branch-checked at all.
--
-- This migration makes the SQL functions themselves the enforcement boundary
-- (defense in depth, so a bug or bypass in the Edge Function layer can no
-- longer write across tenants): every referenced global ID must belong to the
-- actor's business, and every upsert branch must refuse to overwrite a row
-- owned by a different business.
--
-- See .agents/rules/database-and-rls.md (tenant isolation is RLS's job, but
-- these functions run above RLS as SECURITY DEFINER, so they must enforce it
-- themselves) and .agents/rules/offline-sync-and-ledger.md.

-- Helper: raise a tenant-ownership violation if a row's business_id does not
-- match the actor's business. Used by every sync_apply that references a
-- parent-owned entity. Raises errcode 42501 (insufficient_privilege) so the
-- sync-push Edge Function's generic APPLY_FAILED path surfaces it distinctly.
create or replace function public.tenant_owns_entity(
  p_business_id uuid,
  p_table text,
  p_id uuid
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if p_id is null then
    return;
  end if;
  execute format('select business_id from public.%I where id = $1', p_table)
    into v_owner using p_id;
  if v_owner is null or v_owner <> p_business_id then
    raise exception using
      errcode = '42501',
      message = format('Referenced %s does not belong to this business', p_table);
  end if;
end;
$$;

grant execute on function public.tenant_owns_entity(uuid, text, uuid) to service_role;
revoke execute on function public.tenant_owns_entity(uuid, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- sync_apply_sale: validate branch, customer, and every product
-- ---------------------------------------------------------------------------
create or replace function sync_apply_sale(payload jsonb, actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid := (payload->>'id')::uuid;
  v_client_id uuid := (payload->>'clientId')::uuid;
  v_branch_id uuid := (payload->>'branchId')::uuid;
  v_customer_id uuid := nullif(payload->>'customerId', '')::uuid;
  v_created_at_local timestamptz := (payload->>'createdAtLocal')::timestamptz;
  v_existing_id uuid;
  v_item jsonb;
  v_payment jsonb;
  v_credit_amount numeric := 0;
  v_business_id uuid;
begin
  select business_id into v_business_id from users where id = actor_id;

  -- Tenant-ownership: the branch and any customer must belong to the actor.
  perform public.tenant_owns_entity(v_business_id, 'branches', v_branch_id);
  perform public.tenant_owns_entity(v_business_id, 'customers', v_customer_id);

  select id into v_existing_id from sales where client_id = v_client_id;
  if v_existing_id is not null then
    return jsonb_build_object('status', 'skipped', 'reason', 'already_applied', 'id', v_existing_id);
  end if;

  -- Tenant-ownership: every product line must belong to the actor. A sale can
  -- never touch another tenant's product (which would also decrement their
  -- stock via the shared rollup).
  for v_item in select * from jsonb_array_elements(payload->'items')
  loop
    perform public.tenant_owns_entity(v_business_id, 'products', (v_item->>'productId')::uuid);
  end loop;

  insert into sales (
    id, client_id, business_id, branch_id, customer_id,
    subtotal, discount, total, created_at_local, created_by_user_id
  ) values (
    v_sale_id, v_client_id, v_business_id, v_branch_id, v_customer_id,
    (payload->>'subtotal')::numeric, (payload->>'discount')::numeric, (payload->>'total')::numeric,
    v_created_at_local, actor_id
  );

  for v_payment in select * from jsonb_array_elements(payload->'payments')
  loop
    insert into sale_payments (sale_id, method, amount)
    values (v_sale_id, (v_payment->>'method')::payment_method, (v_payment->>'amount')::numeric);

    if v_payment->>'method' = 'credit' then
      v_credit_amount := v_credit_amount + (v_payment->>'amount')::numeric;
    end if;
  end loop;

  if v_credit_amount > 0 and v_customer_id is not null then
    insert into customer_credit_movements (
      id, client_id, business_id, customer_id, amount_delta, source_reference_id,
      created_at_local, created_by_user_id
    ) values (
      gen_random_uuid(), v_client_id, v_business_id, v_customer_id, v_credit_amount, v_sale_id,
      v_created_at_local, actor_id
    );
  end if;

  for v_item in select * from jsonb_array_elements(payload->'items')
  loop
    insert into sale_items (sale_id, product_id, quantity, unit_price, discount, unit_label, unit_conversion_factor)
    values (
      v_sale_id, (v_item->>'productId')::uuid, (v_item->>'quantity')::integer,
      (v_item->>'unitPrice')::numeric, coalesce((v_item->>'discount')::numeric, 0),
      coalesce(nullif(v_item->>'unitLabel', ''), 'piece'), coalesce((v_item->>'conversionFactor')::numeric, 1)
    );

    -- Stock always moves in the product's base unit (products.unit_label),
    -- regardless of which unit was sold — one stock pool underneath. See
    -- finding 1.1-D in docs/RESEARCH-AND-PLAN.md.
    insert into stock_movements (
      id, client_id, business_id, branch_id, product_id, quantity_delta, source,
      source_reference_id, created_at_local, created_by_user_id
    ) values (
      gen_random_uuid(), (v_item->>'movementClientId')::uuid, v_business_id, v_branch_id,
      (v_item->>'productId')::uuid,
      -round((v_item->>'quantity')::numeric * coalesce((v_item->>'conversionFactor')::numeric, 1))::integer,
      'sale', v_sale_id, v_created_at_local, actor_id
    );
  end loop;

  return jsonb_build_object('status', 'applied', 'id', v_sale_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- sync_apply_stock_adjustment: validate branch and product
-- ---------------------------------------------------------------------------
create or replace function sync_apply_stock_adjustment(payload jsonb, actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adjustment_id uuid := (payload->>'id')::uuid;
  v_client_id uuid := (payload->>'clientId')::uuid;
  v_branch_id uuid := (payload->>'branchId')::uuid;
  v_product_id uuid := (payload->>'productId')::uuid;
  v_quantity_delta integer := (payload->>'quantityDelta')::integer;
  v_existing_id uuid;
  v_movement_id uuid;
  v_business_id uuid;
begin
  select business_id into v_business_id from users where id = actor_id;

  -- Tenant-ownership: branch and product must belong to the actor.
  perform public.tenant_owns_entity(v_business_id, 'branches', v_branch_id);
  perform public.tenant_owns_entity(v_business_id, 'products', v_product_id);

  select id into v_existing_id from stock_adjustments where client_id = v_client_id;
  if v_existing_id is not null then
    return jsonb_build_object('status', 'skipped', 'reason', 'already_applied', 'id', v_existing_id);
  end if;

  v_movement_id := gen_random_uuid();

  insert into stock_movements (
    id, client_id, business_id, branch_id, product_id, quantity_delta, source,
    source_reference_id, reason_code, created_at_local, created_by_user_id
  ) values (
    v_movement_id, v_client_id, v_business_id, v_branch_id, v_product_id, v_quantity_delta, 'adjustment',
    v_adjustment_id, payload->>'reasonCode', (payload->>'createdAtLocal')::timestamptz, actor_id
  );

  insert into stock_adjustments (
    id, client_id, business_id, branch_id, product_id, quantity_delta, reason_code, note,
    stock_movement_id, created_by_user_id
  ) values (
    v_adjustment_id, v_client_id, v_business_id, v_branch_id, v_product_id, v_quantity_delta,
    payload->>'reasonCode', payload->>'note', v_movement_id, actor_id
  );

  insert into audit_logs (business_id, actor_user_id, action, entity_type, entity_id, after_state)
  values (v_business_id, actor_id, 'stock_adjustment', 'stock_adjustments', v_adjustment_id, payload);

  return jsonb_build_object('status', 'applied', 'id', v_adjustment_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- sync_apply_purchase_receipt: validate branch, supplier, and every product
-- ---------------------------------------------------------------------------
create or replace function sync_apply_purchase_receipt(payload jsonb, actor_id uuid)
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
begin
  select business_id into v_business_id from users where id = actor_id;

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
    insert into purchase_items (purchase_id, product_id, quantity, unit_cost)
    values (
      v_purchase_id, (v_item->>'productId')::uuid, (v_item->>'quantity')::integer,
      (v_item->>'unitCost')::numeric
    );

    insert into stock_movements (
      id, client_id, business_id, branch_id, product_id, quantity_delta, source,
      source_reference_id, created_at_local, created_by_user_id
    ) values (
      gen_random_uuid(), (v_item->>'movementClientId')::uuid, v_business_id, v_branch_id,
      (v_item->>'productId')::uuid, (v_item->>'quantity')::integer, 'purchase_receipt',
      v_purchase_id, v_created_at_local, actor_id
    );
  end loop;

  return jsonb_build_object('status', 'applied', 'id', v_purchase_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- sync_apply_customer: refuse to overwrite a customer owned by another tenant
-- ---------------------------------------------------------------------------
create or replace function sync_apply_customer(payload jsonb, actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := (payload->>'id')::uuid;
  v_incoming_updated_at timestamptz := (payload->>'updatedAt')::timestamptz;
  v_current_updated_at timestamptz;
  v_business_id uuid;
begin
  select business_id into v_business_id from users where id = actor_id;

  -- A caller-supplied id that already belongs to another tenant must never be
  -- inserted, updated, or "claimed" by this actor.
  if exists (select 1 from customers where id = v_id and business_id <> v_business_id) then
    raise exception using errcode = '42501', message = 'Customer belongs to another business';
  end if;

  select updated_at into v_current_updated_at from customers where id = v_id;

  if v_current_updated_at is null then
    insert into customers (id, business_id, name, phone) values (v_id, v_business_id, payload->>'name', payload->>'phone');
    return jsonb_build_object('status', 'applied', 'id', v_id, 'conflict', false);
  end if;

  if v_incoming_updated_at <= v_current_updated_at then
    return jsonb_build_object('status', 'skipped', 'reason', 'stale', 'id', v_id, 'conflict', true);
  end if;

  update customers set name = payload->>'name', phone = payload->>'phone' where id = v_id;
  return jsonb_build_object('status', 'applied', 'id', v_id, 'conflict', false);
end;
$$;
comment on function sync_apply_customer(jsonb, uuid) is
  'actor_id is accepted for signature symmetry with the other sync_apply_* functions; customers has no created/updated-by column to attribute to.';

-- ---------------------------------------------------------------------------
-- sync_apply_product: validate category/brand ownership and refuse to
-- overwrite a product owned by another tenant
-- ---------------------------------------------------------------------------
create or replace function sync_apply_product(payload jsonb, actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := (payload->>'id')::uuid;
  v_expected_version integer := (payload->>'version')::integer;
  v_current_version integer;
  v_business_id uuid;
begin
  select business_id into v_business_id from users where id = actor_id;

  -- Refuse to touch another tenant's product, or to attach this tenant's
  -- product to another tenant's category/brand.
  if exists (select 1 from products where id = v_id and business_id <> v_business_id) then
    raise exception using errcode = '42501', message = 'Product belongs to another business';
  end if;
  perform public.tenant_owns_entity(v_business_id, 'categories', nullif(payload->>'categoryId', '')::uuid);
  perform public.tenant_owns_entity(v_business_id, 'brands', nullif(payload->>'brandId', '')::uuid);

  select version into v_current_version from products where id = v_id;

  if v_current_version is null then
    insert into products (
      id, business_id, sku, barcode, name, category_id, brand_id, unit_label, alt_unit_label,
      alt_unit_conversion_factor, alt_unit_sell_price, cost_price, sell_price, expiry_tracking
    ) values (
      v_id, v_business_id, payload->>'sku', payload->>'barcode', payload->>'name',
      nullif(payload->>'categoryId', '')::uuid, nullif(payload->>'brandId', '')::uuid,
      coalesce(nullif(payload->>'unitLabel', ''), 'piece'), nullif(payload->>'altUnitLabel', ''),
      (payload->>'altUnitConversionFactor')::numeric, (payload->>'altUnitSellPrice')::numeric,
      (payload->>'costPrice')::numeric,
      (payload->>'sellPrice')::numeric, coalesce((payload->>'expiryTracking')::expiry_tracking_mode, 'off')
    );
    return jsonb_build_object('status', 'applied', 'id', v_id, 'conflict', false);
  end if;

  update products set
    name = payload->>'name',
    barcode = payload->>'barcode',
    category_id = nullif(payload->>'categoryId', '')::uuid,
    brand_id = nullif(payload->>'brandId', '')::uuid,
    unit_label = coalesce(nullif(payload->>'unitLabel', ''), 'piece'),
    alt_unit_label = nullif(payload->>'altUnitLabel', ''),
    alt_unit_conversion_factor = (payload->>'altUnitConversionFactor')::numeric,
    alt_unit_sell_price = (payload->>'altUnitSellPrice')::numeric,
    cost_price = (payload->>'costPrice')::numeric,
    sell_price = (payload->>'sellPrice')::numeric,
    expiry_tracking = coalesce((payload->>'expiryTracking')::expiry_tracking_mode, expiry_tracking)
  where id = v_id;

  return jsonb_build_object(
    'status', 'applied', 'id', v_id,
    'conflict', v_expected_version is not null and v_expected_version <> v_current_version
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- sync_apply_credit_payment: validate the customer belongs to the actor
-- ---------------------------------------------------------------------------
create or replace function sync_apply_credit_payment(payload jsonb, actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := (payload->>'id')::uuid;
  v_client_id uuid := (payload->>'clientId')::uuid;
  v_customer_id uuid := (payload->>'customerId')::uuid;
  v_amount numeric(14, 2) := (payload->>'amount')::numeric(14, 2);
  v_existing_id uuid;
  v_business_id uuid;
begin
  select business_id into v_business_id from users where id = actor_id;

  -- Tenant-ownership: the credit movement is written against this actor's
  -- business ledger but must reference one of their own customers.
  perform public.tenant_owns_entity(v_business_id, 'customers', v_customer_id);

  select id into v_existing_id from customer_credit_movements where client_id = v_client_id;
  if v_existing_id is not null then
    return jsonb_build_object('status', 'skipped', 'reason', 'already_applied', 'id', v_existing_id);
  end if;

  insert into customer_credit_movements (
    id, client_id, business_id, customer_id, amount_delta, source_reference_id, note,
    created_at_local, created_by_user_id
  ) values (
    v_id, v_client_id, v_business_id, v_customer_id, -v_amount, v_id, payload->>'note',
    (payload->>'createdAtLocal')::timestamptz, actor_id
  );

  return jsonb_build_object('status', 'applied', 'id', v_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- sync_apply_expense: validate branch ownership (branch_id is nullable)
-- ---------------------------------------------------------------------------
create or replace function sync_apply_expense(payload jsonb, actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := (payload->>'id')::uuid;
  v_existing_id uuid;
  v_business_id uuid;
begin
  select business_id into v_business_id from users where id = actor_id;

  -- Tenant-ownership: if a branch is supplied, it must belong to the actor.
  perform public.tenant_owns_entity(v_business_id, 'branches', nullif(payload->>'branchId', '')::uuid);

  select id into v_existing_id from expenses where id = v_id;
  if v_existing_id is not null then
    return jsonb_build_object('status', 'skipped', 'reason', 'already_applied', 'id', v_existing_id);
  end if;

  insert into expenses (id, business_id, branch_id, category, amount, note, created_by_user_id)
  values (
    v_id, v_business_id, nullif(payload->>'branchId', '')::uuid, payload->>'category',
    (payload->>'amount')::numeric, nullif(payload->>'note', ''), actor_id
  );

  return jsonb_build_object('status', 'applied', 'id', v_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- sync_apply_supplier: refuse to overwrite a supplier owned by another tenant
-- ---------------------------------------------------------------------------
create or replace function sync_apply_supplier(payload jsonb, actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := (payload->>'id')::uuid;
  v_business_id uuid;
begin
  select business_id into v_business_id from users where id = actor_id;

  -- A caller-supplied id that already belongs to another tenant must never be
  -- inserted or overwritten by this actor.
  if exists (select 1 from suppliers where id = v_id and business_id <> v_business_id) then
    raise exception using errcode = '42501', message = 'Supplier belongs to another business';
  end if;

  insert into suppliers (id, business_id, name, phone)
  values (v_id, v_business_id, payload->>'name', payload->>'phone')
  on conflict (id) do update set name = excluded.name, phone = excluded.phone;

  return jsonb_build_object('status', 'applied', 'id', v_id, 'conflict', false);
end;
$$;
comment on function sync_apply_supplier(jsonb, uuid) is
  'actor_id accepted for signature symmetry with the other sync_apply_* functions; suppliers has no created/updated-by column to attribute to.';
