-- Additive authorization bridge. Existing users, roles, RLS policies, ledger,
-- sync functions, and deployed migration history remain untouched.
-- The old role column stays during the compatibility window; runtime code can
-- read account_type/capabilities first and fall back to role until migrated.

alter table public.users
  add column if not exists account_type text
  check (account_type in ('ADMIN', 'BUSINESS_OWNER', 'WORKER'));

update public.users
set account_type = case
  when role::text = 'super_admin' then 'ADMIN'
  when role::text = 'owner' then 'BUSINESS_OWNER'
  else 'WORKER'
end
where account_type is null;

alter table public.business_memberships
  add column if not exists type text
  check (type in ('owner', 'worker'));

update public.business_memberships
set type = case when role::text = 'owner' then 'owner' else 'worker' end
where type is null;

create table if not exists public.worker_permissions (
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.business_profile(id) on delete cascade,
  permission text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, business_id, permission)
);

alter table public.worker_permissions enable row level security;

grant select on public.worker_permissions to authenticated;
grant all on public.worker_permissions to service_role;

create policy worker_permissions_select on public.worker_permissions
  for select to authenticated
  using (
    user_id = auth.uid()
    or (business_id = auth_business_id() and auth_role() in ('owner', 'admin'))
    or is_platform_admin()
  );

comment on column public.users.account_type is
  'Trusted account classification bridge: ADMIN, BUSINESS_OWNER, or WORKER.';
comment on table public.worker_permissions is
  'Capability grants for WORKER accounts. Backend and RLS must validate ownership.';
