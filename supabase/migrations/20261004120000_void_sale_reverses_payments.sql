-- Closes B1: Voiding a sale previously reversed stock and customer credit, but
-- never touched sale_payments. As a result, payments for voided sales remained
-- active in the ledger and corrupted cash reconciliation and payment-level reporting.
--
-- This migration adds `voided_at` to `sale_payments` and updates `void_sale`
-- to atomically mark all payment legs as voided at the same instant the sale,
-- stock movements, and credit entries are reversed.

alter table public.sale_payments
  add column if not exists voided_at timestamptz;

comment on column public.sale_payments.voided_at is
  'Timestamp when the parent sale was voided. NULL for active payments.
   Payments with voided_at IS NOT NULL must be excluded from active revenue
   and cash reconciliation calculations.';

create index if not exists idx_sale_payments_voided
  on public.sale_payments (sale_id)
  where voided_at is null;

create or replace function public.void_sale(
  p_sale_id uuid,
  p_actor_id uuid,
  p_business_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale record;
  v_reversed_movements integer := 0;
  v_reversed_credit_movements integer := 0;
  v_reversed_payments integer := 0;
begin
  select id, business_id, branch_id, voided_at
    into v_sale
  from public.sales
  where id = p_sale_id and business_id = p_business_id
  for update;

  if not found then
    raise exception 'Sale not found' using errcode = 'P0002';
  end if;

  if v_sale.voided_at is not null then
    raise exception 'This sale was already voided' using errcode = 'P0001';
  end if;

  -- 1. Reversal stock movements
  insert into public.stock_movements (
    id, client_id, business_id, branch_id, product_id, quantity_delta,
    source, source_reference_id, created_at_local, created_by_user_id
  )
  select
    gen_random_uuid(), gen_random_uuid(), v_sale.business_id, v_sale.branch_id,
    product_id, -quantity_delta, 'sale_void', v_sale.id, now(), p_actor_id
  from public.stock_movements
  where source_reference_id = v_sale.id and source = 'sale';
  get diagnostics v_reversed_movements = row_count;

  -- 2. Reversal customer credit movements
  insert into public.customer_credit_movements (
    id, client_id, business_id, customer_id, amount_delta, source_reference_id,
    note, created_at_local, created_by_user_id
  )
  select
    gen_random_uuid(), gen_random_uuid(), v_sale.business_id, customer_id, -amount_delta,
    v_sale.id, 'Void of sale ' || left(v_sale.id::text, 8), now(), p_actor_id
  from public.customer_credit_movements
  where source_reference_id = v_sale.id;
  get diagnostics v_reversed_credit_movements = row_count;

  -- 3. Void payment legs (Closes B1)
  update public.sale_payments
  set voided_at = now()
  where sale_id = v_sale.id and voided_at is null;
  get diagnostics v_reversed_payments = row_count;

  -- 4. Mark sale as voided
  update public.sales
  set voided_at = now(), voided_by_user_id = p_actor_id, void_reason = p_reason
  where id = v_sale.id;

  -- 5. Audit log
  insert into public.audit_logs (
    business_id, actor_user_id, action, entity_type, entity_id, before_state, after_state
  )
  values (
    v_sale.business_id, p_actor_id, 'void_sale', 'sales', v_sale.id,
    jsonb_build_object('voided_at', null),
    jsonb_build_object('voided_at', now(), 'reason', p_reason, 'reversed_payments', v_reversed_payments)
  );

  return jsonb_build_object(
    'status', 'ok',
    'reversedMovements', v_reversed_movements,
    'reversedCreditMovements', v_reversed_credit_movements,
    'reversedPayments', v_reversed_payments
  );
end;
$$;

revoke all on function public.void_sale(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.void_sale(uuid, uuid, uuid, text) to service_role;
