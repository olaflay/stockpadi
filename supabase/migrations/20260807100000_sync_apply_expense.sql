-- expense: a plain create, not a ledger entry — nothing sums expenses
-- against a running total the way stock/credit movements do, so this is
-- idempotent on the row's own id (same shape as sync_apply_customer),
-- not a client_id dedupe key. See docs/RESEARCH-AND-PLAN.md Phase 3 item 21
-- and .agents/rules/offline-sync-and-ledger.md.
--
-- Deletion is local-only today (mirrors the existing product-delete
-- behavior in src/app/(app)/products/[id]/page.tsx), so there is
-- deliberately no sync_apply_expense_delete counterpart here yet.

create or replace function sync_apply_expense(payload jsonb, actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := (payload->>'id')::uuid;
  v_existing_id uuid;
  v_business_id uuid;
begin
  select business_id into v_business_id from users where id = actor_id;

  select id into v_existing_id from expenses where id = v_id;
  if v_existing_id is not null then
    return jsonb_build_object('status', 'skipped', 'reason', 'already_applied', 'id', v_existing_id);
  end if;

  insert into expenses (id, business_id, branch_id, category, amount, note, created_by_user_id)
  values (
    v_id, v_business_id, nullif(payload->>'branchId', '')::uuid, payload->>'category',
    (payload->>'amount')::numeric, nullif(payload->>'note', ''), actor_id
  );

  return jsonb_build_object('status', 'applied', 'id', v_id);
end;
$$;

revoke execute on function sync_apply_expense(jsonb, uuid) from public, anon, authenticated;
grant execute on function sync_apply_expense(jsonb, uuid) to service_role;
