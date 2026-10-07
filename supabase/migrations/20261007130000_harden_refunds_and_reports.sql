-- Financial correctness hardening for refunds.
--
-- The old refund RPC accepted a client unit price and generated a fresh refund
-- UUID on every call. That made a lost response unsafe to retry and allowed a
-- caller to manufacture a refund amount. This migration preserves existing
-- refund rows, gives them a stable identity, and replaces the write path with
-- an atomic, server-derived transaction.

alter table public.sale_refunds
  add column if not exists client_refund_id uuid;

-- Existing refunds already have a durable immutable id. Reusing that id as the
-- historical idempotency key does not change a financial value or invent data.
update public.sale_refunds
set client_refund_id = id
where client_refund_id is null;

alter table public.sale_refunds
  alter column client_refund_id set not null;

create unique index if not exists sale_refunds_client_refund_id_uidx
  on public.sale_refunds(client_refund_id);

alter table public.sale_refund_items
  add column if not exists unit_conversion_factor numeric(14, 3);

-- Keep report access aligned with the account model: platform admins are
-- authorized for the tenant they administer, while workers remain branch and
-- capability scoped. No write access is added.
drop policy if exists authoritative_tenant_select on public.sale_refunds;
create policy authoritative_tenant_select on public.sale_refunds
  for select using (
    public.auth_can_access_business(business_id)
    and (
      public.auth_account_type() in ('BUSINESS_OWNER', 'ADMIN')
      or (
        public.auth_worker_has_capability('VIEW_REPORTS')
        and public.auth_can_access_branch(business_id, branch_id)
      )
    )
  );

drop policy if exists authoritative_tenant_select on public.sale_refund_items;
create policy authoritative_tenant_select on public.sale_refund_items
  for select using (
    exists (
      select 1 from public.sale_refunds sr
      where sr.id = sale_refund_items.refund_id
        and public.auth_can_access_business(sr.business_id)
        and (
          public.auth_account_type() in ('BUSINESS_OWNER', 'ADMIN')
          or (public.auth_worker_has_capability('VIEW_REPORTS') and public.auth_can_access_branch(sr.business_id, sr.branch_id))
        )
    )
  );

drop policy if exists authoritative_tenant_select on public.sale_refund_payments;
create policy authoritative_tenant_select on public.sale_refund_payments
  for select using (
    exists (
      select 1 from public.sale_refunds sr
      where sr.id = sale_refund_payments.refund_id
        and public.auth_can_access_business(sr.business_id)
        and (
          public.auth_account_type() in ('BUSINESS_OWNER', 'ADMIN')
          or (public.auth_worker_has_capability('VIEW_REPORTS') and public.auth_can_access_branch(sr.business_id, sr.branch_id))
        )
    )
  );

drop function if exists public.refund_sale(uuid, uuid, uuid, jsonb, jsonb, text);

create or replace function public.refund_sale(
  p_client_refund_id uuid,
  p_sale_id uuid,
  p_actor_id uuid,
  p_business_id uuid,
  p_items jsonb,
  p_payments jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale record;
  v_existing record;
  v_item record;
  v_payment record;
  v_original record;
  v_refund_id uuid := p_client_refund_id;
  v_total_refund numeric(14, 2) := 0;
  v_existing_total numeric(14, 2) := 0;
  v_refunded_qty integer := 0;
  v_restored_stock integer := 0;
  v_payment_available numeric(14, 2) := 0;
  v_prior_payment numeric(14, 2) := 0;
  v_requested_payment numeric(14, 2) := 0;
  v_item_total numeric(14, 2) := 0;
  v_sale_subtotal numeric(14, 2) := 0;
  v_line_discount_total numeric(14, 2) := 0;
  v_sale_net_before_order_discount numeric(14, 2) := 0;
  v_order_discount numeric(14, 2) := 0;
  v_refund_net numeric(14, 2) := 0;
  v_original_conversion numeric(14, 3) := 1;
begin
  if p_client_refund_id is null then
    raise exception 'Refund idempotency key is mandatory' using errcode = '22023';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'Refund reason is mandatory' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Refund items are mandatory' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) = 0 then
    raise exception 'Refund payments are mandatory' using errcode = '22023';
  end if;

  -- A retry with the same intent returns the committed result and has no side
  -- effects. A reused key for another sale is a hard conflict.
  select * into v_existing
  from public.sale_refunds
  where client_refund_id = p_client_refund_id;
  if found then
    if v_existing.sale_id <> p_sale_id or v_existing.business_id <> p_business_id then
      raise exception 'Refund idempotency key already belongs to another sale' using errcode = '23505';
    end if;
    select coalesce(sum(total_refunded), 0) into v_existing_total
    from public.sale_refunds where id = v_existing.id;
    return jsonb_build_object(
      'status', 'ok', 'alreadyApplied', true, 'refundId', v_existing.id,
      'totalRefunded', v_existing_total,
      'restoredStock', coalesce((select sum(quantity * coalesce(unit_conversion_factor, 1))::integer from public.sale_refund_items where refund_id = v_existing.id), 0),
      'items', coalesce((select jsonb_agg(jsonb_build_object('productId', product_id, 'quantity', quantity, 'unitPrice', unit_price, 'total', total, 'conversionFactor', coalesce(unit_conversion_factor, 1))) from public.sale_refund_items where refund_id = v_existing.id), '[]'::jsonb),
      'payments', coalesce((select jsonb_agg(jsonb_build_object('method', method, 'amount', amount)) from public.sale_refund_payments where refund_id = v_existing.id), '[]'::jsonb)
    );
  end if;

  select s.id, s.business_id, s.branch_id, s.customer_id, s.voided_at, s.total, s.subtotal, s.discount
    into v_sale
  from public.sales s
  where s.id = p_sale_id and s.business_id = p_business_id
  for update;
  if not found then
    raise exception 'Sale not found' using errcode = 'P0002';
  end if;

  -- Re-check after taking the sale lock. A concurrent retry can have passed
  -- the first lookup while the original transaction was still committing.
  select * into v_existing
  from public.sale_refunds
  where client_refund_id = p_client_refund_id;
  if found then
    if v_existing.sale_id <> p_sale_id or v_existing.business_id <> p_business_id then
      raise exception 'Refund idempotency key already belongs to another sale' using errcode = '23505';
    end if;
    select coalesce(sum(total_refunded), 0) into v_existing_total
    from public.sale_refunds where id = v_existing.id;
    return jsonb_build_object(
      'status', 'ok', 'alreadyApplied', true, 'refundId', v_existing.id,
      'totalRefunded', v_existing_total,
      'restoredStock', coalesce((select sum(quantity * coalesce(unit_conversion_factor, 1))::integer from public.sale_refund_items where refund_id = v_existing.id), 0),
      'items', coalesce((select jsonb_agg(jsonb_build_object('productId', product_id, 'quantity', quantity, 'unitPrice', unit_price, 'total', total, 'conversionFactor', coalesce(unit_conversion_factor, 1))) from public.sale_refund_items where refund_id = v_existing.id), '[]'::jsonb),
      'payments', coalesce((select jsonb_agg(jsonb_build_object('method', method, 'amount', amount)) from public.sale_refund_payments where refund_id = v_existing.id), '[]'::jsonb)
    );
  end if;
  if v_sale.voided_at is not null then
    raise exception 'Cannot refund a voided sale' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.users u
    where u.id = p_actor_id and u.business_id = v_sale.business_id
      and u.is_active = true and u.account_type in ('BUSINESS_OWNER', 'ADMIN')
  ) then
    raise exception 'Refund actor is not an active owner or admin for this business' using errcode = '42501';
  end if;

  -- Reject duplicate product intents. The server must be able to account for
  -- every requested line exactly once.
  if (select count(*) from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer))
     <> (select count(distinct product_id) from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer)) then
    raise exception 'Duplicate refund product lines are not allowed' using errcode = '22023';
  end if;

  select
    coalesce(sum(quantity * unit_price), 0),
    coalesce(sum(discount), 0),
    coalesce(sum(quantity * unit_price - discount), 0)
    into v_sale_subtotal, v_line_discount_total, v_sale_net_before_order_discount
  from public.sale_items
  where sale_id = v_sale.id;
  v_order_discount := greatest(v_sale.discount - v_line_discount_total, 0);
  if v_sale_subtotal <= 0 or v_sale_net_before_order_discount <= 0 then
    raise exception 'Sale has no refundable line value' using errcode = '22023';
  end if;

  -- Validate quantities and derive each refund line from the original sale.
  for v_item in select * from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer) loop
    if v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'Refund quantity must be positive' using errcode = '22003';
    end if;

    select
      coalesce(sum(si.quantity), 0) as sold_quantity,
      coalesce(sum(si.quantity * si.unit_price), 0) as sold_gross,
      coalesce(sum(si.quantity * si.unit_price - si.discount), 0) as sold_net,
      coalesce(sum(si.quantity * si.unit_price) / nullif(sum(si.quantity), 0), 0) as weighted_unit_price,
      coalesce(min(si.unit_conversion_factor), 1) as conversion_factor,
      coalesce(max(si.unit_conversion_factor), 1) as max_conversion_factor
    into v_original
    from public.sale_items si
    join public.products p on p.id = si.product_id and p.business_id = v_sale.business_id
    where si.sale_id = v_sale.id and si.product_id = v_item.product_id;

    if v_original.sold_quantity = 0 then
      raise exception 'Product % was not in the original sale' , v_item.product_id using errcode = 'P0002';
    end if;
    if v_original.conversion_factor <> v_original.max_conversion_factor then
      raise exception 'Refund product % has multiple sale units and must be refunded by an exact original line', v_item.product_id using errcode = '22023';
    end if;

    select coalesce(sum(sri.quantity), 0)
      into v_refunded_qty
    from public.sale_refund_items sri
    join public.sale_refunds sr on sr.id = sri.refund_id
    where sr.sale_id = v_sale.id and sri.product_id = v_item.product_id;
    if v_refunded_qty + v_item.quantity > v_original.sold_quantity then
      raise exception 'Refund quantity exceeds remaining unrefunded quantity for product %', v_item.product_id using errcode = '22003';
    end if;

    -- Preserve line-level discounts first. If the sale also carries an
    -- order-level discount, allocate only that residual discount across the
    -- already-discounted line net. This keeps a partial refund tied to the
    -- original sale semantics instead of reassigning another product's line
    -- discount to the refunded product.
    v_refund_net := (v_item.quantity::numeric / v_original.sold_quantity::numeric) * v_original.sold_net;
    if v_order_discount > 0 then
      v_refund_net := v_refund_net * greatest(0, 1 - (v_order_discount / v_sale_net_before_order_discount));
    end if;
    v_item_total := round(v_refund_net, 2);
    v_total_refund := v_total_refund + v_item_total;
  end loop;

  if v_total_refund <= 0 then
    raise exception 'Refund total must be greater than zero' using errcode = '22003';
  end if;
  select coalesce(sum(total_refunded), 0) into v_existing_total
  from public.sale_refunds where sale_id = v_sale.id;
  if v_existing_total + v_total_refund > v_sale.total then
    raise exception 'Total refund exceeds the original sale amount' using errcode = '22003';
  end if;

  -- Payment methods are constrained by the original sale allocation. The
  -- client may choose how to return the eligible allocation, but cannot create
  -- cash/credit/transfer beyond what was originally recorded.
  for v_payment in select * from jsonb_to_recordset(p_payments) as x(method public.payment_method, amount numeric) loop
    if v_payment.amount is null or v_payment.amount <= 0 then
      raise exception 'Payment refund amount must be positive' using errcode = '22003';
    end if;
    select coalesce(sum(sp.amount), 0) into v_payment_available
    from public.sale_payments sp
    where sp.sale_id = v_sale.id and sp.method = v_payment.method and sp.voided_at is null;
    select coalesce(sum(srp.amount), 0) into v_prior_payment
    from public.sale_refund_payments srp
    join public.sale_refunds sr on sr.id = srp.refund_id
    where sr.sale_id = v_sale.id and srp.method = v_payment.method;
    if v_prior_payment + v_payment.amount > v_payment_available then
      raise exception 'Refund payment exceeds the remaining original % allocation', v_payment.method using errcode = '22003';
    end if;
    v_requested_payment := v_requested_payment + v_payment.amount;
  end loop;
  if abs(v_requested_payment - v_total_refund) > 0.01 then
    raise exception 'Refund payments do not match the server-calculated refund total' using errcode = '22023';
  end if;

  insert into public.sale_refunds (id, client_refund_id, business_id, branch_id, sale_id, actor_user_id, total_refunded, reason)
  values (v_refund_id, p_client_refund_id, v_sale.business_id, v_sale.branch_id, v_sale.id, p_actor_id, v_total_refund, trim(p_reason));

  for v_item in select * from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer) loop
    select
      coalesce(sum(si.quantity * si.unit_price), 0) as sold_gross,
      coalesce(sum(si.quantity), 0) as sold_quantity,
      coalesce(sum(si.quantity * si.unit_price - si.discount) / nullif(sum(si.quantity), 0), 0) as weighted_unit_price,
      coalesce(min(si.unit_conversion_factor), 1) as conversion_factor,
      coalesce(max(si.unit_conversion_factor), 1) as max_conversion_factor
    into v_original
    from public.sale_items si
    join public.products p on p.id = si.product_id and p.business_id = v_sale.business_id
    where si.sale_id = v_sale.id and si.product_id = v_item.product_id;
    if v_original.conversion_factor <> v_original.max_conversion_factor then
      raise exception 'Refund product % has multiple sale units and must be refunded by an exact original line', v_item.product_id using errcode = '22023';
    end if;
    v_refund_net := (v_item.quantity::numeric / v_original.sold_quantity::numeric) * (v_original.sold_gross - coalesce((
      select sum(si.discount)
      from public.sale_items si
      where si.sale_id = v_sale.id and si.product_id = v_item.product_id
    ), 0));
    if v_order_discount > 0 then
      v_refund_net := v_refund_net * greatest(0, 1 - (v_order_discount / v_sale_net_before_order_discount));
    end if;
    v_item_total := round(v_refund_net, 2);
    insert into public.sale_refund_items (refund_id, product_id, quantity, unit_price, total, unit_conversion_factor)
    values (v_refund_id, v_item.product_id, v_item.quantity, v_original.weighted_unit_price, v_item_total, v_original.conversion_factor);
    insert into public.stock_movements (id, client_id, business_id, branch_id, product_id, quantity_delta, source, source_reference_id, reason_code, created_at_local, created_by_user_id)
    values (gen_random_uuid(), gen_random_uuid(), v_sale.business_id, v_sale.branch_id, v_item.product_id,
      round(v_item.quantity * v_original.conversion_factor)::integer, 'sale_refund', v_refund_id, trim(p_reason), now(), p_actor_id);
    v_restored_stock := v_restored_stock + round(v_item.quantity * v_original.conversion_factor)::integer;
  end loop;

  for v_payment in select * from jsonb_to_recordset(p_payments) as x(method public.payment_method, amount numeric) loop
    insert into public.sale_refund_payments (refund_id, method, amount)
    values (v_refund_id, v_payment.method, v_payment.amount);
    if v_payment.method = 'credit' and v_sale.customer_id is not null then
      insert into public.customer_credit_movements (id, client_id, business_id, customer_id, amount_delta, source_reference_id, note, created_at_local, created_by_user_id)
      values (gen_random_uuid(), gen_random_uuid(), v_sale.business_id, v_sale.customer_id, -v_payment.amount, v_refund_id, 'Refund for sale ' || left(v_sale.id::text, 8), now(), p_actor_id);
    end if;
  end loop;

  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, before_state, after_state)
  values (v_sale.business_id, p_actor_id, 'refund_sale', 'sale_refunds', v_refund_id,
    jsonb_build_object('sale_id', v_sale.id), jsonb_build_object('refund_id', v_refund_id, 'total_refunded', v_total_refund, 'restored_stock', v_restored_stock, 'reason', trim(p_reason)));

  return jsonb_build_object(
    'status', 'ok', 'alreadyApplied', false, 'refundId', v_refund_id,
    'totalRefunded', v_total_refund, 'restoredStock', v_restored_stock,
    'items', coalesce((select jsonb_agg(jsonb_build_object('productId', product_id, 'quantity', quantity, 'unitPrice', unit_price, 'total', total, 'conversionFactor', coalesce(unit_conversion_factor, 1))) from public.sale_refund_items where refund_id = v_refund_id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('method', method, 'amount', amount)) from public.sale_refund_payments where refund_id = v_refund_id), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.refund_sale(uuid, uuid, uuid, uuid, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.refund_sale(uuid, uuid, uuid, uuid, jsonb, jsonb, text) to service_role;
