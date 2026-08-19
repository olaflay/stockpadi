-- Expand/contract authorization bridge.
-- Historical app_role columns and policies remain for compatibility, but all
-- policy helpers now resolve through platform_admins and business_memberships.
-- A worker is deliberately mapped to the legacy cashier capability shape only
-- inside the compatibility layer; the account model itself has no worker roles.

create or replace function public.auth_account_type()
returns text
language sql stable security definer set search_path = public
as $$
  select case
    when exists (
      select 1 from public.platform_admins
      where user_id = auth.uid() and status = 'active'
    ) then 'ADMIN'
    else (
      select bm.account_type
      from public.business_memberships bm
      join public.business_profile bp on bp.id = bm.business_id
      where bm.user_id = auth.uid()
        and bm.status = 'active'
        and bp.status = 'verified'
        and bp.is_active = true
      order by bm.created_at
      limit 1
    )
  end;
$$;

create or replace function public.auth_business_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select bm.business_id
  from public.business_memberships bm
  join public.business_profile bp on bp.id = bm.business_id
  where bm.user_id = auth.uid()
    and bm.status = 'active'
    and bp.status = 'verified'
    and bp.is_active = true
  order by bm.created_at
  limit 1;
$$;

create or replace function public.auth_role()
returns app_role
language sql stable security definer set search_path = public
as $$
  select case public.auth_account_type()
    when 'ADMIN' then 'admin'::app_role
    when 'BUSINESS_OWNER' then 'owner'::app_role
    else 'cashier'::app_role
  end;
$$;

create or replace function public.auth_is_branch_scoped_role()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.auth_account_type() = 'WORKER';
$$;

create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.auth_account_type() = 'ADMIN';
$$;

comment on function public.auth_account_type() is
  'Authoritative account resolver: platform_admins first, then active verified membership.';
