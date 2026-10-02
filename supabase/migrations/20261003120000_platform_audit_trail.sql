-- Closes Q5: platform-admin actions (both mutations and reads) must be audited,
-- and fixes the critical FK violation where platform admins (who have no public.users row)
-- caused set_business_status to throw 500 AUDIT_FAILED on audit_logs insert.

create table if not exists public.platform_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  business_id uuid references public.business_profile(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.platform_audit_logs is
  'Audit trail for platform administration and cross-tenant operations.
   actor_user_id references auth.users(id) because platform admins have no row
   in public.users. business_id is nullable (for global reads) and
   on delete set null so platform history survives business deletion.';

-- Indexes for querying by actor or business
create index if not exists idx_platform_audit_logs_actor on public.platform_audit_logs (actor_user_id, created_at desc);
create index if not exists idx_platform_audit_logs_business on public.platform_audit_logs (business_id, created_at desc);

-- RLS enabled: strictly service_role only. No access to anon or authenticated.
alter table public.platform_audit_logs enable row level security;

-- Revoke all default privileges from public, anon, and authenticated
revoke all on public.platform_audit_logs from public, anon, authenticated;
grant all on public.platform_audit_logs to service_role;

-- Atomic RPC for setting business status with guaranteed platform audit trail
create or replace function public.platform_set_business_status(
  p_business_id uuid,
  p_status text,
  p_actor_id uuid,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_active boolean;
begin
  if p_status not in ('pending', 'verified', 'suspended', 'rejected') then
    raise exception 'INVALID_STATUS: %', p_status;
  end if;

  v_is_active := (p_status in ('verified', 'pending'));

  update public.business_profile
  set
    status = p_status,
    is_active = v_is_active,
    updated_at = now()
  where id = p_business_id;

  if not found then
    raise exception 'BUSINESS_NOT_FOUND: %', p_business_id;
  end if;

  insert into public.platform_audit_logs (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    business_id,
    metadata
  ) values (
    p_actor_id,
    'business_' || p_status,
    'business_profile',
    p_business_id,
    p_business_id,
    p_metadata
  );
end;
$$;

revoke all on function public.platform_set_business_status(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.platform_set_business_status(uuid, text, uuid, jsonb) to service_role;
