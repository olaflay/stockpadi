-- Security hardening based on Supabase Database Linter findings
-- Resolves:
--   - 0013_rls_disabled_in_public (public._migrations)
--   - 0011_function_search_path_mutable (set_updated_at, bump_product_version, stock_movements_bump_rollup)
--   - 0028_anon_security_definer_function_executable (revokes anon/public EXECUTE on RLS helpers)
--   - 0029_authenticated_security_definer_function_executable (drops obsolete handle_new_owner)

-- 1. Secure internal migrations tracking table if present
do $$
begin
  if to_regclass('public._migrations') is not null then
    execute 'alter table public._migrations enable row level security';
    execute 'revoke all on table public._migrations from anon, authenticated';
  end if;
end $$;

-- 2. Fix mutable search_path on trigger functions
alter function public.set_updated_at() set search_path = public;
alter function public.bump_product_version() set search_path = public;
alter function public.stock_movements_bump_rollup() set search_path = public;

-- 3. Drop obsolete handle_new_owner function (trigger on auth.users was dropped in 20260816000000)
drop function if exists public.handle_new_owner();

-- 4. Revoke EXECUTE from public & anon on internal SECURITY DEFINER functions,
--    and ensure explicit EXECUTE is granted ONLY to authenticated & service_role
--    for Row Level Security (RLS) policy evaluation.
revoke execute on function public.auth_account_type() from public, anon;
revoke execute on function public.auth_branch_ids() from public, anon;
revoke execute on function public.auth_business_id() from public, anon;
revoke execute on function public.auth_can_access_branch(uuid, uuid) from public, anon;
revoke execute on function public.auth_can_access_business(uuid) from public, anon;
revoke execute on function public.auth_is_branch_scoped_role() from public, anon;
revoke execute on function public.auth_role() from public, anon;
revoke execute on function public.auth_worker_has_capability(text) from public, anon;
revoke execute on function public.is_platform_admin() from public, anon;
revoke execute on function public.is_super_admin() from public, anon;

grant execute on function public.auth_account_type() to authenticated, service_role;
grant execute on function public.auth_branch_ids() to authenticated, service_role;
grant execute on function public.auth_business_id() to authenticated, service_role;
grant execute on function public.auth_can_access_branch(uuid, uuid) to authenticated, service_role;
grant execute on function public.auth_can_access_business(uuid) to authenticated, service_role;
grant execute on function public.auth_is_branch_scoped_role() to authenticated, service_role;
grant execute on function public.auth_role() to authenticated, service_role;
grant execute on function public.auth_worker_has_capability(text) to authenticated, service_role;
grant execute on function public.is_platform_admin() to authenticated, service_role;
grant execute on function public.is_super_admin() to authenticated, service_role;
