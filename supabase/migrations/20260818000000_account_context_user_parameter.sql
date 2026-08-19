-- Replace the zero-argument form so every caller uses one implementation.
-- The default keeps authenticated-RLS/Edge call sites working.
drop function if exists public.resolve_account_context();

-- Allow trusted server callers to resolve the same account context after they
-- have already validated the bearer token with Supabase Auth. The default
-- keeps the authenticated-RLS/Edge call form working.
create or replace function public.resolve_account_context(
  p_user_id uuid default auth.uid(),
  p_allow_pending_owner boolean default false
)
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
begin
  if p_user_id is null then
    return;
  end if;

  if exists (
    select 1 from public.platform_admins
    where platform_admins.user_id = p_user_id
      and platform_admins.status = 'active'
  ) then
    return query select p_user_id, 'ADMIN'::text, null::uuid, null::text, null::text, '{}'::uuid[];
    return;
  end if;

  return query
  select
    p_user_id,
    memberships.account_type,
    memberships.business_id,
    businesses.status,
    memberships.status,
    case when memberships.account_type = 'WORKER'
      then coalesce(array_agg(distinct assignments.branch_id) filter (where assignments.branch_id is not null), '{}'::uuid[])
      else '{}'::uuid[]
    end
  from public.business_memberships memberships
  join public.business_profile businesses on businesses.id = memberships.business_id
  join public.users profiles on profiles.id = p_user_id and profiles.is_active = true
  left join public.user_branches assignments
    on assignments.user_id = p_user_id
   and assignments.business_id = memberships.business_id
  where memberships.user_id = p_user_id
    and memberships.status = 'active'
    and businesses.is_active = true
    and (
      businesses.status = 'verified'
      or (p_allow_pending_owner and memberships.account_type = 'BUSINESS_OWNER' and businesses.status = 'pending')
    )
  group by memberships.account_type, memberships.business_id, businesses.status, memberships.status;
end;
$$;

revoke all on function public.resolve_account_context(uuid, boolean) from public, anon;
grant execute on function public.resolve_account_context(uuid, boolean) to authenticated, service_role;
