-- Closes B2: Refunds do not exist.
--
-- A void cancels a sale immediately (e.g. before settlement or cashier mistake).
-- A refund returns customer money and/or restocks returned goods on settled sales,
-- recording an explicit outflow in the cash/payment ledger and restocking the inventory ledger.
--
-- Online-only by Locked Decision #4 (.agents/rules/payment-and-pci-scope.md item 4).

-- 1. Extend stock_movement_source enum to include 'sale_refund'
alter type public.stock_movement_source add value if not exists 'sale_refund';

-- 2. Table: public.sale_refunds
create table if not exists public.sale_refunds (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profile(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  actor_user_id uuid not null references public.users(id),
  total_refunded numeric(14, 2) not null check (total_refunded > 0),
  reason text not null,
  created_at_local timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.sale_refunds is
  'Settled sale refunds. Append-only ledger of refunds issued against historical sales.
   Never updates the historical sale amounts, preserving financial immutability.';

create index if not exists idx_sale_refunds_sale_id
  on public.sale_refunds(sale_id);

create index if not exists idx_sale_refunds_business_created
  on public.sale_refunds(business_id, created_at_local desc);

-- 3. Table: public.sale_refund_items
create table if not exists public.sale_refund_items (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references public.sale_refunds(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity integer not null check (quantity > 0),
  unit_price numeric(14, 2) not null,
  total numeric(14, 2) not null
);

create index if not exists idx_sale_refund_items_refund_id
  on public.sale_refund_items(refund_id);

-- 4. Table: public.sale_refund_payments
create table if not exists public.sale_refund_payments (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references public.sale_refunds(id) on delete cascade,
  method public.payment_method not null,
  amount numeric(14, 2) not null check (amount > 0)
);

create index if not exists idx_sale_refund_payments_refund_id
  on public.sale_refund_payments(refund_id);

-- 5. Enable RLS
alter table public.sale_refunds enable row level security;
alter table public.sale_refund_items enable row level security;
alter table public.sale_refund_payments enable row level security;

-- RLS Policies
create policy authoritative_tenant_select on public.sale_refunds
  for select
  using (
    public.auth_can_access_business(business_id)
    and (
      public.auth_account_type() = 'BUSINESS_OWNER'
      or (
        public.auth_worker_has_capability('VIEW_REPORTS')
        and public.auth_can_access_branch(business_id, branch_id)
      )
    )
  );

create policy authoritative_tenant_select on public.sale_refund_items
  for select
  using (
    exists (
      select 1 from public.sale_refunds sr
      where sr.id = sale_refund_items.refund_id
        and public.auth_can_access_business(sr.business_id)
    )
  );

create policy authoritative_tenant_select on public.sale_refund_payments
  for select
  using (
    exists (
      select 1 from public.sale_refunds sr
      where sr.id = sale_refund_payments.refund_id
        and public.auth_can_access_business(sr.business_id)
    )
  );

-- Direct client inserts disabled; all refund writes route through the refund_sale RPC
revoke insert, update, delete on public.sale_refunds from authenticated, anon;
revoke insert, update, delete on public.sale_refund_items from authenticated, anon;
revoke insert, update, delete on public.sale_refund_payments from authenticated, anon;

-- 6. RPC: public.refund_sale
create or replace function public.refund_sale(
  p_sale_id uuid,
  p_actor_id uuid,
  p_business_id uuid,
  p_items jsonb, -- array of { product_id: uuid, quantity: int, unit_price: numeric }
  p_payments jsonb, -- array of { method: text, amount: numeric }
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale record;
  v_refund_id uuid := gen_random_uuid();
  v_total_refunded numeric(14, 2) := 0;
  v_item record;
  v_payment record;
  v_restored_stock integer := 0;
  v_original_item record;
  v_already_refunded_qty integer := 0;
  v_already_refunded_total numeric(14, 2) := 0;
begin
  -- 1. Validate sale ownership and status
  select id, business_id, branch_id, customer_id, voided_at, total
    into v_sale
  from public.sales
  where id = p_sale_id and business_id = p_business_id
  for update;

  if not found then
    raise exception 'Sale not found' using errcode = 'P0002';
  end if;

  if v_sale.voided_at is not null then
    raise exception 'Cannot refund a voided sale' using errcode = 'P0001';
  end if;

  if p_reason is null or trim(p_reason) = '' then
    raise exception 'Refund reason is mandatory' using errcode = '22023';
  end if;

  -- Calculate total refund amount from payments
  for v_payment in select * from jsonb_to_recordset(p_payments) as x(method public.payment_method, amount numeric) loop
    if v_payment.amount <= 0 then
      raise exception 'Payment refund amount must be positive' using errcode = '22003';
    end if;
    v_total_refunded := v_total_refunded + v_payment.amount;
  end loop;

  if v_total_refunded <= 0 then
    raise exception 'Refund total must be greater than zero' using errcode = '22003';
  end if;

  -- Ensure cumulative refund does not exceed sale total
  select coalesce(sum(total_refunded), 0) into v_already_refunded_total
  from public.sale_refunds
  where sale_id = v_sale.id;

  if (v_already_refunded_total + v_total_refunded) > v_sale.total then
    raise exception 'Total refund exceeds the original sale amount' using errcode = '22003';
  end if;

  -- Validate item quantities
  for v_item in select * from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer, unit_price numeric) loop
    if v_item.quantity <= 0 then
      raise exception 'Refund quantity must be positive' using errcode = '22003';
    end if;

    select quantity into v_original_item
    from public.sale_items
    where sale_id = v_sale.id and product_id = v_item.product_id;

    if not found then
      raise exception 'Product % was not in the original sale', v_item.product_id using errcode = 'P0002';
    end if;

    select coalesce(sum(sri.quantity), 0) into v_already_refunded_qty
    from public.sale_refund_items sri
    join public.sale_refunds sr on sr.id = sri.refund_id
    where sr.sale_id = v_sale.id and sri.product_id = v_item.product_id;

    if (v_already_refunded_qty + v_item.quantity) > v_original_item.quantity then
      raise exception 'Refund quantity exceeds remaining unrefunded quantity for product %', v_item.product_id using errcode = '22003';
    end if;
  end loop;

  -- 2. Insert into sale_refunds
  insert into public.sale_refunds (
    id, business_id, branch_id, sale_id, actor_user_id, total_refunded, reason
  ) values (
    v_refund_id, v_sale.business_id, v_sale.branch_id, v_sale.id, p_actor_id, v_total_refunded, p_reason
  );

  -- 3. Insert refund line items and create positive restocking movements
  for v_item in select * from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer, unit_price numeric) loop
    insert into public.sale_refund_items (
      refund_id, product_id, quantity, unit_price, total
    ) values (
      v_refund_id, v_item.product_id, v_item.quantity, v_item.unit_price, v_item.quantity * v_item.unit_price
    );

    insert into public.stock_movements (
      id, client_id, business_id, branch_id, product_id, quantity_delta,
      source, source_reference_id, reason_code, created_at_local, created_by_user_id
    ) values (
      gen_random_uuid(), gen_random_uuid(), v_sale.business_id, v_sale.branch_id,
      v_item.product_id, v_item.quantity, 'sale_refund', v_refund_id, p_reason, now(), p_actor_id
    );
    v_restored_stock := v_restored_stock + v_item.quantity;
  end loop;

  -- 4. Insert refund payments and reverse customer credit if credit method was refunded
  for v_payment in select * from jsonb_to_recordset(p_payments) as x(method public.payment_method, amount numeric) loop
    insert into public.sale_refund_payments (
      refund_id, method, amount
    ) values (
      v_refund_id, v_payment.method, v_payment.amount
    );

    if v_payment.method = 'credit' and v_sale.customer_id is not null then
      insert into public.customer_credit_movements (
        id, client_id, business_id, customer_id, amount_delta, source_reference_id,
        note, created_at_local, created_by_user_id
      ) values (
        gen_random_uuid(), gen_random_uuid(), v_sale.business_id, v_sale.customer_id,
        -v_payment.amount, v_refund_id, 'Refund for sale ' || left(v_sale.id::text, 8), now(), p_actor_id
      );
    end if;
  end loop;

  -- 5. Audit log
  insert into public.audit_logs (
    business_id, actor_user_id, action, entity_type, entity_id, before_state, after_state
  ) values (
    v_sale.business_id, p_actor_id, 'refund_sale', 'sale_refunds', v_refund_id,
    jsonb_build_object('sale_id', v_sale.id),
    jsonb_build_object(
      'refund_id', v_refund_id,
      'total_refunded', v_total_refunded,
      'restored_stock', v_restored_stock,
      'reason', p_reason
    )
  );

  return jsonb_build_object(
    'status', 'ok',
    'refundId', v_refund_id,
    'totalRefunded', v_total_refunded,
    'restoredStock', v_restored_stock
  );
end;
$$;
