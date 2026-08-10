-- credit_payment: a customer paying down debt, the counterpart to the
-- credit-tagged portion of a sale (sync_apply_sale already derives that
-- half). Writes a single, negative customer_credit_movements row — never a
-- balance update, per .agents/rules/offline-sync-and-ledger.md. Idempotent
-- on client_id, same shape as sync_apply_stock_adjustment.
-- See docs/RESEARCH-AND-PLAN.md Section 4.3 and Phase 2 item 18.

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

revoke execute on function sync_apply_credit_payment(jsonb, uuid) from public, anon, authenticated;
grant execute on function sync_apply_credit_payment(jsonb, uuid) to service_role;
