-- Two hardening fixes to sync_apply_sale:
--
-- 1. Server-side stock-availability check. Until now, neither the client
--    (src/features/pos/complete-sale.ts, fixed alongside this migration) nor
--    the server ever verified a sale's requested quantity against actual
--    current stock before writing the stock-out movement, so a sale for more
--    units than were in stock succeeded unconditionally and silently drove
--    stock negative. This is the server-side half of that fix — without it,
--    a device that bypasses the client check (a modified client, or a sale
--    synced from a device that was offline when stock changed elsewhere)
--    could still push stock negative. Checked per line item, in order, so
--    multiple lines for the same product within one sale correctly see the
--    running balance after each prior line's movement is applied.
--
-- 2. Server-side total revalidation. subtotal/total/payment amounts were
--    previously inserted verbatim from the payload with no recomputation —
--    the only check was client-side (a disabled-submit-button condition in
--    PaymentStep.tsx), not a hard server-side assertion. Now recomputed from
--    payload->'items' and payload->'payments' and rejected on mismatch.

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
  v_current_stock numeric;
  v_product_name text;
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

  -- Never trust a client-computed total verbatim — recompute from the line
  -- items and payments themselves before writing anything. Previously
  -- nothing here re-derived subtotal/total from payload->'items' or checked
  -- that payments summed to the declared total.
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

    -- A sale must never silently drive stock negative — see
    -- .agents/rules/offline-sync-and-ledger.md. Re-reads current stock on
    -- every iteration so multiple lines for the same product see each
    -- other's effect within this same sale.
    v_requested_qty := round((v_item->>'quantity')::numeric * coalesce((v_item->>'conversionFactor')::numeric, 1));

    select coalesce(sum(quantity_delta), 0) into v_current_stock
    from stock_movements
    where product_id = (v_item->>'productId')::uuid and branch_id = v_branch_id;

    if v_requested_qty > v_current_stock then
      select name into v_product_name from products where id = (v_item->>'productId')::uuid;
      raise exception 'Not enough stock for %: % available, % requested',
        coalesce(v_product_name, 'this product'), v_current_stock, v_requested_qty
        using errcode = 'P0001';
    end if;

    -- Stock always moves in the product's base unit (products.unit_label),
    -- regardless of which unit was sold — one stock pool underneath. See
    -- finding 1.1-D in docs/RESEARCH-AND-PLAN.md.
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
