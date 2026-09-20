-- Repair migration for environments where the original worker permission RPC
-- was not applied or PostgREST has an outdated function definition.

create or replace function public.set_worker_permissions(
  p_business_id uuid,
  p_user_id uuid,
  p_permissions text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.users
    where id = p_user_id
      and business_id = p_business_id
      and account_type = 'WORKER'
  ) then
    raise exception using errcode = '42501', message = 'Worker does not belong to this business';
  end if;

  delete from public.worker_permissions
  where user_id = p_user_id and business_id = p_business_id;

  insert into public.worker_permissions (user_id, business_id, permission, enabled)
  select p_user_id, p_business_id, permission, true
  from (
    select distinct unnest(coalesce(p_permissions, '{}'::text[])) as permission
  ) requested
  where permission is not null and btrim(permission) <> '';
end;
$$;

revoke all on function public.set_worker_permissions(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.set_worker_permissions(uuid, uuid, text[]) to service_role;

select pg_notify('pgrst', 'reload schema');
