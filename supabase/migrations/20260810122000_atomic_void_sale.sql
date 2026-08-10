-- void-sale/index.ts previously read sale.voided_at, then later wrote it,
-- with the reversal inserts in between — a classic TOCTOU race. Two
-- concurrent void requests for the same sale (double-click, a retried
-- request after a slow response) could both pass the "not already voided"
-- check before either write landed, double-crediting stock back and
-- double-erasing customer debt. A partial failure between the reversal
-- inserts and the final voided_at write could also leave a sale voided
-- without a matching reversal, or reversed-but-not-marked-voided (allowing
-- a retry to reverse it again).
--
-- Moves the whole operation into one security-definer function, following
-- the same pattern as sync_apply_sale/sync_apply_credit_payment: one
-- Postgres transaction, `select ... for update` on the sale row to make
-- concurrent voids serialize instead of race, and either everything commits
-- or nothing does.

create or replace function void_sale(p_sale_id uuid, p_actor_id uuid, p_business_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale record;
  v_reversed_movements integer := 0;
  v_reversed_credit_movements integer := 0;
begin
  select id, business_id, branch_id, voided_at
    into v_sale
  from sales
  where id = p_sale_id and business_id = p_business_id
  for update;

  if not found then
    raise exception 'Sale not found' using errcode = 'P0002';
  end if;

  if v_sale.voided_at is not null then
    raise exception 'This sale was already voided' using errcode = 'P0001';
  end if;

  insert into stock_movements (
    id, client_id, business_id, branch_id, product_id, quantity_delta,
    source, source_reference_id, created_at_local, created_by_user_id
  )
  select
    gen_random_uuid(), gen_random_uuid(), v_sale.business_id, v_sale.branch_id,
    product_id, -quantity_delta, 'sale_void', v_sale.id, now(), p_actor_id
  from stock_movements
  where source_reference_id = v_sale.id and source = 'sale';
  get diagnostics v_reversed_movements = row_count;

  insert into customer_credit_movements (
    id, client_id, business_id, customer_id, amount_delta, source_reference_id,
    note, created_at_local, created_by_user_id
  )
  select
    gen_random_uuid(), gen_random_uuid(), v_sale.business_id, customer_id, -amount_delta,
    v_sale.id, 'Void of sale ' || left(v_sale.id::text, 8), now(), p_actor_id
  from customer_credit_movements
  where source_reference_id = v_sale.id;
  get diagnostics v_reversed_credit_movements = row_count;

  update sales
  set voided_at = now(), voided_by_user_id = p_actor_id, void_reason = p_reason
  where id = v_sale.id;

  insert into audit_logs (business_id, actor_user_id, action, entity_type, entity_id, before_state, after_state)
  values (
    v_sale.business_id, p_actor_id, 'void_sale', 'sales', v_sale.id,
    jsonb_build_object('voided_at', null),
    jsonb_build_object('voided_at', now(), 'reason', p_reason)
  );

  return jsonb_build_object(
    'status', 'ok',
    'reversedMovements', v_reversed_movements,
    'reversedCreditMovements', v_reversed_credit_movements
  );
end;
$$;

comment on function void_sale is 'Atomic void: locks the sale row (for update) so concurrent void requests serialize instead of racing past the already-voided check. Called only from the void-sale Edge Function, which validates the caller''s role and active status first. security definer since the caller only has anon-key RLS-scoped access; role/business checks happen in the calling function/edge function.';

revoke all on function void_sale(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function void_sale(uuid, uuid, uuid, text) to service_role;
