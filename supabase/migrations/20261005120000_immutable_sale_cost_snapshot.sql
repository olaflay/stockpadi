-- 20261005120000_immutable_sale_cost_snapshot.sql
--
-- Blocker B3: Immutable Cost Snapshot on sale_items
--
-- TRUST Promise 4: Profit figures are consistent and immutable.
--
-- Historical profit was mutable because sale_items lacked cost snapshots:
-- computing gross profit read the product's current cost_price, meaning any
-- cost update or product deletion retroactively changed historical financial
-- statements.
--
-- This migration implements Section 1.3-1.5 and Section 2 of docs/COSTING-AND-PRICING.md:
-- 1. Adds unit_cost, cost_basis, product_version, and cost_flags to sale_items.
-- 2. Preserves NULL for historical rows (never fabricate historical backfill).
-- 3. Updates sync_apply_sale to accept client snapshots, clamp/flag anomalies
--    (±10% band check flagging 'out_of_band' without silently substituting),
--    and pin product_version.

-- 1. Alter table sale_items
alter table public.sale_items
  add column if not exists unit_cost numeric(14, 2),
  add column if not exists cost_basis text check (cost_basis in ('snapshot', 'provisional', 'estimated_backfill')),
  add column if not exists product_version integer,
  add column if not exists cost_flags text[] default '{}'::text[];

comment on column public.sale_items.unit_cost is 'The immutable cost per sold unit snapshotted at the moment of sale. NULL means unknown (historical sale before snapshotting); never guessed or backfilled. IAS 2 para 25/27.';
comment on column public.sale_items.cost_basis is 'Classification of the cost source: snapshot (point of sale), provisional (vendor bill pending), or estimated_backfill.';
comment on column public.sale_items.product_version is 'Version of the products row at sale time, ensuring historical reconstruction survives product edits or soft deletes.';
comment on column public.sale_items.cost_flags is 'Audit tags for costing exceptions: out_of_band, backfilled, negative_stock, provisional.';

-- 2. Replace sync_apply_sale to persist the cost snapshot immutably
create or replace function sync_apply_sale(payload jsonb, actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_id uuid := (payload->>'clientId')::uuid;
  v_sale_id uuid := coalesce((payload->>'id')::uuid, gen_random_uuid());
  v_branch_id uuid := (payload->>'branchId')::uuid;
  v_customer_id uuid := (payload->>'customerId')::uuid;
  v_declared_subtotal numeric := (payload->>'subtotal')::numeric;
  v_declared_discount numeric := coalesce((payload->>'discount')::numeric, 0);
  v_declared_total numeric := (payload->>'total')::numeric;
  v_created_at_local timestamptz := (payload->>'createdAtLocal')::timestamptz;
  v_business_id uuid;
  v_existing_id uuid;
  v_payment jsonb;
  v_credit_amount numeric := 0;
  v_item jsonb;
  v_computed_subtotal numeric;
  v_payments_sum numeric;

  -- Per-item snapshot variables
  v_prod_id uuid;
  v_prod_cost numeric;
  v_prod_version integer;
  v_item_unit_cost numeric;
  v_item_cost_basis text;
  v_item_prod_version integer;
  v_item_conversion numeric;
  v_expected_cost numeric;
  v_item_flags text[];
  v_flag_elem jsonb;
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

  -- Guard 1: declared subtotal must equal the line items it claims to summarise.
  select coalesce(sum((item->>'unitPrice')::numeric * (item->>'quantity')::numeric), 0)
    into v_computed_subtotal
  from jsonb_array_elements(payload->'items') as item;

  if abs(v_computed_subtotal - v_declared_subtotal) > 0.01 then
    raise exception 'Sale subtotal does not match line items: declared %, computed %',
      v_declared_subtotal, v_computed_subtotal
      using errcode = 'P0001';
  end if;

  -- Guard 2: the total must be the subtotal less the discount actually recorded.
  if abs(v_declared_total - (v_declared_subtotal - v_declared_discount)) > 0.01 then
    raise exception 'Sale total does not match subtotal less discount: subtotal %, discount %, total %',
      v_declared_subtotal, v_declared_discount, v_declared_total
      using errcode = 'P0001';
  end if;

  -- Guard 3: the payments must sum to the total.
  select coalesce(sum((p->>'amount')::numeric), 0)
    into v_payments_sum
  from jsonb_array_elements(payload->'payments') as p;

  if abs(v_payments_sum - v_declared_total) > 0.01 then
    raise exception 'Sale payments do not sum to declared total: declared %, payments %',
      v_declared_total, v_payments_sum
      using errcode = 'P0001';
  end if;

  insert into sales (
    id, client_id, business_id, branch_id, customer_id,
    subtotal, discount, total, created_at_local, created_by_user_id
  ) values (
    v_sale_id, v_client_id, v_business_id, v_branch_id, v_customer_id,
    v_declared_subtotal, v_declared_discount, v_declared_total,
    v_created_at_local, actor_id
  );

  for v_payment in select * from jsonb_array_elements(payload->'payments')
  loop
    insert into sale_payments (sale_id, method, amount, tendered_amount, note)
    values (
      v_sale_id, (v_payment->>'method')::payment_method, (v_payment->>'amount')::numeric,
      nullif(v_payment->>'tenderedAmount', '')::numeric,
      nullif(v_payment->>'note', '')
    );

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
    v_prod_id := (v_item->>'productId')::uuid;
    v_item_conversion := coalesce((v_item->>'conversionFactor')::numeric, 1);
    v_item_unit_cost := nullif(v_item->>'unitCost', '')::numeric;
    v_item_cost_basis := nullif(v_item->>'costBasis', '');
    v_item_prod_version := nullif(v_item->>'productVersion', '')::integer;
    v_item_flags := array[]::text[];

    -- Fetch current product cost & version from database for audit validation
    select cost_price, version into v_prod_cost, v_prod_version
    from products where id = v_prod_id;

    if v_item_prod_version is null then
      v_item_prod_version := v_prod_version;
    end if;

    -- Ingest client cost flags if array provided
    if v_item ? 'costFlags' and jsonb_typeof(v_item->'costFlags') = 'array' then
      for v_flag_elem in select * from jsonb_array_elements_text(v_item->'costFlags')
      loop
        if v_flag_elem#>>'{}' is not null and not (v_flag_elem#>>'{}' = any(v_item_flags)) then
          v_item_flags := array_append(v_item_flags, v_flag_elem#>>'{}');
        end if;
      end loop;
    end if;

    -- Validate client snapshot against product cost (Section 1.4: client-reported, server-clamped)
    if v_item_unit_cost is not null then
      if v_item_cost_basis is null then
        v_item_cost_basis := 'snapshot';
      end if;

      if v_prod_cost is not null and v_prod_cost > 0 then
        v_expected_cost := v_prod_cost * v_item_conversion;
        -- Outside ±10% band: accept the snapshot but flag out_of_band
        if v_expected_cost > 0 and (v_item_unit_cost < v_expected_cost * 0.90 or v_item_unit_cost > v_expected_cost * 1.10) then
          if not ('out_of_band' = any(v_item_flags)) then
            v_item_flags := array_append(v_item_flags, 'out_of_band');
          end if;
        end if;
      end if;
    end if;

    insert into sale_items (
      sale_id, product_id, quantity, unit_price, discount, unit_label, unit_conversion_factor,
      unit_cost, cost_basis, product_version, cost_flags
    ) values (
      v_sale_id, v_prod_id, (v_item->>'quantity')::integer,
      (v_item->>'unitPrice')::numeric, coalesce((v_item->>'discount')::numeric, 0),
      coalesce(nullif(v_item->>'unitLabel', ''), 'piece'), v_item_conversion,
      v_item_unit_cost, v_item_cost_basis, v_item_prod_version, v_item_flags
    );

    insert into stock_movements (
      id, client_id, business_id, branch_id, product_id, quantity_delta, source,
      source_reference_id, created_at_local, created_by_user_id
    ) values (
      gen_random_uuid(), (v_item->>'movementClientId')::uuid, v_business_id, v_branch_id,
      v_prod_id,
      -round((v_item->>'quantity')::numeric * v_item_conversion)::integer,
      'sale', v_sale_id, v_created_at_local, actor_id
    );
  end loop;

  return jsonb_build_object('status', 'applied', 'id', v_sale_id);
end;
$$;

revoke execute on function sync_apply_sale(jsonb, uuid) from public, anon, authenticated;
grant execute on function sync_apply_sale(jsonb, uuid) to service_role;
