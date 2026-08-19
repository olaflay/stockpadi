-- Complete the platform/tenant separation without deleting the historical
-- synthetic business row or any tenant data. Platform admins no longer need a
-- users.business_id relationship; their authority comes from platform_admins.

alter table public.users alter column business_id drop not null;

update public.users
set business_id = null
where role::text = 'super_admin'
  and exists (
    select 1 from public.platform_admins pa
    where pa.user_id = users.id and pa.status = 'active'
  );

comment on column public.users.business_id is
  'Nullable for platform admins. Tenant users must still resolve through an active business membership.';
