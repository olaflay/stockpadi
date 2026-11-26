-- Preserve a removed tenant's business, staff, stock, sales, and audit history.
-- A platform admin can restore it without reconstructing account records.
alter table public.business_profile
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_previous_status text
    check (deleted_previous_status is null or deleted_previous_status in ('pending', 'verified', 'suspended', 'rejected'));

create index if not exists business_profile_deleted_at_idx
  on public.business_profile (deleted_at) where deleted_at is not null;

create or replace function public.platform_soft_delete_business(p_business_id uuid, p_actor_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  select status into v_status from public.business_profile where id = p_business_id for update;
  if not found then raise exception 'BUSINESS_NOT_FOUND: %', p_business_id; end if;
  if exists (select 1 from public.business_profile where id = p_business_id and deleted_at is not null) then
    raise exception 'BUSINESS_ALREADY_DELETED: %', p_business_id;
  end if;

  update public.business_profile
  set deleted_at = now(), deleted_previous_status = v_status,
      status = 'suspended', is_active = false, updated_at = now()
  where id = p_business_id;

  insert into public.platform_audit_logs (actor_user_id, action, entity_type, entity_id, business_id, metadata)
  values (p_actor_id, 'business_soft_deleted', 'business_profile', p_business_id, p_business_id,
    jsonb_build_object('previous_status', v_status, 'records_preserved', true));
end;
$$;

create or replace function public.platform_restore_business(p_business_id uuid, p_actor_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  select deleted_previous_status into v_status from public.business_profile
  where id = p_business_id and deleted_at is not null for update;
  if not found then
    if not exists (select 1 from public.business_profile where id = p_business_id) then
      raise exception 'BUSINESS_NOT_FOUND: %', p_business_id;
    end if;
    raise exception 'BUSINESS_NOT_DELETED: %', p_business_id;
  end if;

  v_status := coalesce(v_status, 'verified');
  update public.business_profile
  set deleted_at = null, deleted_previous_status = null,
      status = v_status, is_active = (v_status in ('verified', 'pending')), updated_at = now()
  where id = p_business_id;

  insert into public.platform_audit_logs (actor_user_id, action, entity_type, entity_id, business_id, metadata)
  values (p_actor_id, 'business_restored', 'business_profile', p_business_id, p_business_id,
    jsonb_build_object('restored_status', v_status, 'records_preserved', true));
end;
$$;

revoke all on function public.platform_soft_delete_business(uuid, uuid) from public, anon, authenticated;
revoke all on function public.platform_restore_business(uuid, uuid) from public, anon, authenticated;
grant execute on function public.platform_soft_delete_business(uuid, uuid) to service_role;
grant execute on function public.platform_restore_business(uuid, uuid) to service_role;
