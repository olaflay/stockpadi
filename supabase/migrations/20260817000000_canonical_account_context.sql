-- Canonical account context for backend services and privileged Edge Functions.
-- This is additive: existing RLS helpers and compatibility columns remain intact.
create or replace function public.resolve_account_context()
returns table (
  user_id uuid,
  account_type text,
  business_id uuid,
  business_status text,
  membership_status text,
  branch_ids uuid[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    return;
  end if;

  if exists (
    select 1 from public.platform_admins
    where platform_admins.user_id = current_user_id
      and platform_admins.status = 'active'
  ) then
    return query select current_user_id, 'ADMIN'::text, null::uuid, null::text, null::text, '{}'::uuid[];
    return;
  end if;

  return query
  select
    current_user_id,
    case when memberships.account_type = 'BUSINESS_OWNER' then 'BUSINESS_OWNER' else 'WORKER' end,
    memberships.business_id,
    businesses.status,
    memberships.status,
    case when memberships.account_type = 'WORKER'
      then coalesce(array_agg(distinct assignments.branch_id) filter (where assignments.branch_id is not null), '{}'::uuid[])
      else '{}'::uuid[]
    end
  from public.business_memberships memberships
  join public.business_profile businesses on businesses.id = memberships.business_id
  join public.users profiles on profiles.id = current_user_id and profiles.is_active = true
  left join public.user_branches assignments
    on assignments.user_id = current_user_id
   and assignments.business_id = memberships.business_id
  where memberships.user_id = current_user_id
    and memberships.status = 'active'
    and businesses.is_active = true
    and businesses.status = 'verified'
  group by memberships.account_type, memberships.business_id, businesses.status, memberships.status;
end;
$$;

revoke all on function public.resolve_account_context() from public, anon;
grant execute on function public.resolve_account_context() to authenticated, service_role;

comment on function public.resolve_account_context() is
'Canonical account context for ADMIN, BUSINESS_OWNER, and WORKER. Derives identity from platform_admins, business_memberships, business_profile, users, and user_branches.';
