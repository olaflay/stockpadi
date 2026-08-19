-- Additive only. Does not modify users, business_profile.is_active, or any
-- existing policy/function. Phase 1 of the platform/tenant separation.
--
-- Decisions made to unblock this migration (documented, not silent):
--   1. is_active=false backfills to status='suspended', not 'rejected'.
--      Every existing business_profile row already passed through
--      handle_new_owner() at signup, i.e. it was created, not merely
--      applied for -- there is no existing "pending application" state in
--      this data, so false can only mean "was active, got turned off" for
--      any row that predates this migration. New rows going forward can
--      start 'pending' at the application layer once that flow exists.
--   2. 'admin' role is left exactly as-is (mirrored into
--      business_memberships unchanged) -- manage-staff already treats it
--      as owner-equivalent for staff management purposes, and nothing in
--      this migration reinterprets what it means.

create table platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'revoked')),
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
comment on table platform_admins is
  'Platform-level privilege, independent of any tenant. A row here requires
   no business_id and no users row.';

alter table business_profile
  add column if not exists status text not null default 'verified'
    check (status in ('pending', 'verified', 'suspended', 'rejected'));
comment on column business_profile.status is
  'Additive alongside the existing is_active boolean during the migration
   window. Backfilled from is_active by this migration: true -> verified,
   false -> suspended (see file header for why).';

update business_profile set status = 'suspended' where is_active = false;

create table business_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references business_profile(id) on delete cascade,
  role app_role not null,
  status text not null default 'active' check (status in ('active', 'disabled', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, business_id)
);
comment on table business_memberships is
  'Mirrors users.business_id/role during the dual-write window. Worker/owner
   status here is independent of business_profile.status by design --
   suspending a business must never flip an individual membership status.';

insert into platform_admins (user_id, status)
select id, case when is_active then 'active' else 'revoked' end
from users
where role = 'super_admin'
on conflict (user_id) do nothing;

insert into business_memberships (user_id, business_id, role, status)
select id, business_id, role, case when is_active then 'active' else 'disabled' end
from users
where role <> 'super_admin'
on conflict (user_id, business_id) do nothing;

-- New tables don't inherit the project-bootstrap grants that existing
-- tables already have; grant explicitly rather than relying on that
-- one-time bootstrap, matching the pattern every sync_apply_* function
-- already uses for service_role.
grant select on platform_admins, business_memberships to authenticated;
grant all on platform_admins, business_memberships to service_role;

alter table platform_admins enable row level security;
alter table business_memberships enable row level security;

create function is_platform_admin() returns boolean as $$
  select exists (
    select 1 from platform_admins
    where user_id = auth.uid() and status = 'active'
  );
$$ language sql stable security definer set search_path = public;

create policy platform_admins_select on platform_admins
  for select to authenticated using (is_platform_admin());

create policy business_memberships_select on business_memberships
  for select to authenticated using (
    user_id = auth.uid()
    or business_id = auth_business_id()
    or is_platform_admin()
  );
-- No write policy yet -- writes still happen through users/manage-staff in
-- Phase 1. A dual-write path lands in Phase 2.
