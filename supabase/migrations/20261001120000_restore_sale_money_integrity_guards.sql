-- Restores the sale money-integrity guards that were silently lost.
--
-- History of the regression:
--   20260809120000_sync_apply_sale_stock_check.sql            added the guards
--   20260810121000_revert_sync_apply_sale_stock_rejection.sql kept them, while
--       removing only the insufficient-stock rejection
--   20260823000000_sync_apply_tenant_ownership.sql           re-created the whole
--       function to add tenant-ownership checks and DROPPED the guards on the way
--   20260904100000_sale_payment_tendered_note.sql            re-created it again,
--       described as "Re-created unchanged from 20260823000000"
--
-- Because the newest guard-bearing migration predates the shipping definition by
-- four revisions, reading the migration history in isolation shows the checks
-- still in place. They are not. sync_apply_sale currently stores subtotal,
-- discount, total and every sale_payments row exactly as the device sent them.
--
-- Why this matters: sales.total and the sum of sale_payments.amount are each
-- authoritative for a different report. A payload where they disagree
-- permanently desynchronises revenue from the cash and payment-method
-- breakdown, and nothing downstream detects or repairs it.
--
-- These are arithmetic integrity checks only. They say nothing about stock:
-- insufficient stock is still always honoured and still drives stock negative,
-- per .agents/rules/offline-sync-and-ledger.md. The client (complete-sale.ts)
-- already satisfies all three checks - it computes
-- subtotal = sum(unitPrice * quantity), sets discount = 0, sets total = subtotal
-- and rejects non-positive payments locally - so a well-behaved device is
-- unaffected, and only a buggy or tampered payload is rejected.

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
  v_declared_subtotal numeric := (payload->>'subtotal')::numeric;
  v_declared_discount numeric := coalesce((payload->>'discount')::numeric, 0);
  v_declared_total numeric := (payload->>'total')::numeric;
  v_computed_subtotal numeric;
  v_payments_sum numeric;
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
  -- Without this, a payload can declare a discount and still charge the
  -- undiscounted amount, overstating revenue by exactly the discount.
  if abs(v_declared_total - (v_declared_subtotal - v_declared_discount)) > 0.01 then
    raise exception 'Sale total does not match subtotal less discount: subtotal %, discount %, total %',
      v_declared_subtotal, v_declared_discount, v_declared_total
      using errcode = 'P0001';
  end if;

  -- Guard 3: the payments must sum to the total, so no sale can be recorded as
  -- revenue without the money that paid for it being attributed to a method.
  -- An empty payments array sums to 0 and is therefore rejected for any
  -- non-zero total.
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
    insert into sale_items (sale_id, product_id, quantity, unit_price, discount, unit_label, unit_conversion_factor)
    values (
      v_sale_id, (v_item->>'productId')::uuid, (v_item->>'quantity')::integer,
      (v_item->>'unitPrice')::numeric, coalesce((v_item->>'discount')::numeric, 0),
      coalesce(nullif(v_item->>'unitLabel', ''), 'piece'), coalesce((v_item->>'conversionFactor')::numeric, 1)
    );

    -- Stock always moves in the product's base unit (products.unit_label),
    -- regardless of which unit was sold - one stock pool underneath. See
    -- finding 1.1-D in docs/RESEARCH-AND-PLAN.md.
    --
    -- Never rejected here for insufficient stock: both concurrent offline sales
    -- must be honored per .agents/rules/offline-sync-and-ledger.md, even if
    -- that drives stock negative - that is the intended, honest signal to the
    -- owner.
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

-- create or replace preserves the existing ACL, but this is a SECURITY DEFINER
-- function and its privilege boundary is the whole point of the tenant-ownership
-- work, so the boundary is re-asserted rather than assumed.
revoke execute on function sync_apply_sale(jsonb, uuid) from public, anon, authenticated;
grant execute on function sync_apply_sale(jsonb, uuid) to service_role;