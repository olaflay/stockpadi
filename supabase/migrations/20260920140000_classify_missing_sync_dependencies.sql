-- A missing referenced row is normally an ordering/dependency problem, not a
-- cross-tenant access attempt. Keep the latter forbidden, but let the client
-- retry the former after the prerequisite mutation arrives.
create or replace function public.tenant_owns_entity(
  p_business_id uuid,
  p_table text,
  p_id uuid
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_exists boolean;
  v_owner uuid;
begin
  if p_id is null then
    return;
  end if;

  execute format('select exists (select 1 from public.%I where id = $1)', p_table)
    into v_exists using p_id;

  if not v_exists then
    raise exception using
      errcode = '23503',
      message = format('Referenced %s is not synced yet', p_table);
  end if;

  execute format('select business_id from public.%I where id = $1', p_table)
    into v_owner using p_id;

  if v_owner is null or v_owner <> p_business_id then
    raise exception using
      errcode = '42501',
      message = format('Referenced %s does not belong to this business', p_table);
  end if;
end;
$$;

grant execute on function public.tenant_owns_entity(uuid, text, uuid) to service_role;
revoke execute on function public.tenant_owns_entity(uuid, text, uuid) from public, anon, authenticated;
