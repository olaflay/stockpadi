-- supplier: plain upsert by id. suppliers has neither a version column
-- (like products) nor an updated_at column (like customers) to arbitrate
-- conflicting concurrent edits, so this is last-write-wins with no
-- staleness check at all — acceptable here since supplier name/phone is
-- low-stakes, editable metadata, not financial history.
-- See docs/RESEARCH-AND-PLAN.md Phase 3 item 22.

create or replace function sync_apply_supplier(payload jsonb, actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := (payload->>'id')::uuid;
  v_business_id uuid;
begin
  select business_id into v_business_id from users where id = actor_id;

  insert into suppliers (id, business_id, name, phone)
  values (v_id, v_business_id, payload->>'name', payload->>'phone')
  on conflict (id) do update set name = excluded.name, phone = excluded.phone;

  return jsonb_build_object('status', 'applied', 'id', v_id, 'conflict', false);
end;
$$;
comment on function sync_apply_supplier(jsonb, uuid) is
  'actor_id accepted for signature symmetry with the other sync_apply_* functions; suppliers has no created/updated-by column to attribute to.';

revoke execute on function sync_apply_supplier(jsonb, uuid) from public, anon, authenticated;
grant execute on function sync_apply_supplier(jsonb, uuid) to service_role;
