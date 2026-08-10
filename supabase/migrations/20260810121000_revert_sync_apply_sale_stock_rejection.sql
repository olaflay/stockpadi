-- 20260809120000_sync_apply_sale_stock_check.sql added a hard rejection when
-- a synced sale's requested quantity exceeds current stock. That reintroduces
-- the exact failure mode .agents/rules/offline-sync-and-ledger.md exists to
-- prevent: "two cashiers... can both sell the last unit... both must be
-- honored when the devices reconnect... it just produces a negative stock
-- number... Negative stock is a visible, honest signal."
--
-- By the time a sale reaches sync_apply_sale, the client has already
-- committed it locally and collected payment (complete-sale.ts already runs
-- its own pre-sale stock check against the device's local ledger). Rejecting
-- it here on the server means money was collected but the sale never lands
-- server-side — it retries forever via the outbox (drain-outbox.ts) since
-- stock never "frees up", and stock is never decremented for a completed
-- sale. This migration removes the rejection and restores "always honor,
-- let stock go negative", while keeping the total/subtotal revalidation
-- from the same prior migration, which is a legitimate integrity check
-- (unrelated to the ledger-merge rule).

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
  v_requested_qty numeric;
  v_computed_subtotal numeric;
  v_declared_subtotal numeric := (payload->>'subtotal')::numeric;
  v_declared_total numeric := (payload->>'total')::numeric;
  v_payments_sum numeric;
begin
  select business_id into v_business_id from users where id = actor_id;

  select id into v_existing_id from sales where client_id = v_client_id;
  if v_existing_id is not null then
    return jsonb_build_object('status', 'skipped', 'reason', 'already_applied', 'id', v_existing_id);
  end if;

  select coalesce(sum((item->>'unitPrice')::numeric * (item->>'quantity')::numeric), 0)
    into v_computed_subtotal
  from jsonb_array_elements(payload->'items') as item;

  if abs(v_computed_subtotal - v_declared_subtotal) > 0.01 then
    raise exception 'Sale subtotal does not match line items: declared %, computed %',
      v_declared_subtotal, v_computed_subtotal
      using errcode = 'P0001';
  end if;

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
    -- finding 1.1-D in docs/RESEARCH-AND-PLAN.md. Never rejected here for
    -- insufficient stock: both concurrent offline sales must be honored per
    -- .agents/rules/offline-sync-and-ledger.md, even if that drives stock
    -- negative — that is the intended, honest signal to the owner.
    v_requested_qty := round((v_item->>'quantity')::numeric * coalesce((v_item->>'conversionFactor')::numeric, 1));

    insert into stock_movements (
      id, client_id, business_id, branch_id, product_id, quantity_delta, source,
      source_reference_id, created_at_local, created_by_user_id
    ) values (
      gen_random_uuid(), (v_item->>'movementClientId')::uuid, v_business_id, v_branch_id,
      (v_item->>'productId')::uuid, -v_requested_qty::integer,
      'sale', v_sale_id, v_created_at_local, actor_id
    );
  end loop;

  return jsonb_build_object('status', 'applied', 'id', v_sale_id);
end;
$$;
