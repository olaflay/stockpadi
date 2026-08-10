-- Server-side merge functions for the sync-push Edge Function.
-- One function per SyncEntityType (src/types/sync.ts). Each function body is
-- a single implicit Postgres transaction: it either fully applies or fully
-- rolls back, satisfying the transactional requirement in
-- .agents/skills/write-edge-function.md. Each function is idempotent on the
-- client-generated id (or client_id column), so a retried batch after a
-- dropped connection is safe to replay. See .agents/rules/offline-sync-and-ledger.md.
--
-- These are SECURITY DEFINER and only callable by service_role: the calling
-- user's role is authorized by the sync-push Edge Function BEFORE it invokes
-- one of these, per "RLS still applies" in write-edge-function.md. A device
-- can never call these directly; the anon/authenticated roles have no
-- execute grant on them.

-- ---------------------------------------------------------------------------
-- sale: append-only, so idempotency is a plain skip-if-exists on client_id.
-- Stock movements are derived from the sale's line items here rather than
-- synced as their own entity. Each derived movement reuses the clientId the
-- device already wrote to its own IndexedDB (payload item's
-- movementClientId), so when this row is realtime-pushed back to the
-- originating device, mergeIncomingStockMovements recognizes it by clientId
-- and skips it instead of double-counting the sale's stock impact.
--
-- A sale carries one or more payments (payload->'payments'), not a single
-- payment_method tag — see sale_payments in the init migration. Any
-- credit-tagged portion also derives a customer_credit_movements row here,
-- reusing the sale's own client_id as that movement's client_id (mirrors
-- src/features/pos/complete-sale.ts exactly, so the client-computed local
-- balance and the server-computed balance never diverge). This closes a gap
-- in the original version of this function, which recorded the credit sale
-- but never wrote the ledger entry that makes the debt collectible.
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

  select id into v_existing_id from sales where client_id = v_client_id;
  if v_existing_id is not null then
    return jsonb_build_object('status', 'skipped', 'reason', 'already_applied', 'id', v_existing_id);
  end if;

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
-- stock_adjustment: manual correction, always paired 1:1 with a
-- stock_movements row. Reuses the adjustment's own client_id as the paired
-- movement's client_id (safe: they are different tables, and the pairing is
-- always 1:1). Writes the mandatory audit_logs row per
-- .agents/rules/database-and-rls.md.
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
-- purchase_receipt: same shape as sale, stock moves in rather than out.
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

  select id into v_existing_id from purchases where client_id = v_client_id;
  if v_existing_id is not null then
    return jsonb_build_object('status', 'skipped', 'reason', 'already_applied', 'id', v_existing_id);
  end if;

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
-- customer: not append-only, no version column on this table (unlike
-- products). Plain last-write-wins on updated_at: an incoming write that is
-- not newer than what the server already has is skipped, not overwritten.
-- Idempotent by construction, applying the same update twice yields the same
-- end state, so there is no separate client_id dedupe needed here.
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
-- product: last-write-wins by field via the version column, per PRD 10.2.
-- Applies the incoming write either way (low stakes if a stale edit is
-- lost), but reports whether the device's expected version had already
-- moved on so the client can surface the "changed while you were offline"
-- notice from .agents/rules/offline-sync-and-ledger.md. products_bump_version
-- (existing trigger) increments version and updated_at automatically.
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
-- Lock these down: only the sync-push Edge Function (service_role) may call
-- them. A device's own anon/authenticated connection must never reach these
-- directly, the role check happens in the Edge Function before dispatch, not
-- inside these functions, so bypassing the Edge Function would bypass
-- authorization entirely.
-- ---------------------------------------------------------------------------

revoke execute on function sync_apply_sale(jsonb, uuid) from public, anon, authenticated;
revoke execute on function sync_apply_stock_adjustment(jsonb, uuid) from public, anon, authenticated;
revoke execute on function sync_apply_purchase_receipt(jsonb, uuid) from public, anon, authenticated;
revoke execute on function sync_apply_customer(jsonb, uuid) from public, anon, authenticated;
revoke execute on function sync_apply_product(jsonb, uuid) from public, anon, authenticated;

grant execute on function sync_apply_sale(jsonb, uuid) to service_role;
grant execute on function sync_apply_stock_adjustment(jsonb, uuid) to service_role;
grant execute on function sync_apply_purchase_receipt(jsonb, uuid) to service_role;
grant execute on function sync_apply_customer(jsonb, uuid) to service_role;
grant execute on function sync_apply_product(jsonb, uuid) to service_role;
