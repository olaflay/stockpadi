-- Forward-only account model bridge. Keep the historical app_role column
-- during the expand/contract window, but make account_type authoritative for
-- account-context and staff provisioning.
alter table public.business_memberships
  add column if not exists account_type text;

update public.business_memberships
set account_type = case when role::text = 'owner' then 'BUSINESS_OWNER' else 'WORKER' end
where account_type is null;

alter table public.business_memberships
  alter column account_type set default 'WORKER',
  alter column account_type set not null;

alter table public.business_memberships
  drop constraint if exists business_memberships_account_type_check;

alter table public.business_memberships
  add constraint business_memberships_account_type_check
  check (account_type in ('BUSINESS_OWNER', 'WORKER'));

comment on column public.business_memberships.account_type is
  'Authoritative tenant account type. ADMIN is represented only by platform_admins.';
