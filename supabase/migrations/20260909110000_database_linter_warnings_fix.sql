-- Fix remaining Supabase Database Linter warnings.
-- This migration re-applies fixes from 20260908160000 (which may have run
-- before the affected objects existed) and closes the anon-role EXECUTE
-- warnings on the internal auth_* SECURITY DEFINER helpers.
--
-- Resolves:
--   - 0013_rls_disabled_in_public (public._migrations)
--   - 0011_function_search_path_mutable (set_updated_at, bump_product_version, stock_movements_bump_rollup)
--   - 0028_anon_security_definer_function_executable (drop anon EXECUTE on all auth_* helpers)
--
-- NOTE: 0029 (authenticated_security_definer_function_executable) is
-- INTENTIONALLY NOT fixed for the auth_* helpers. Every one of them is
-- referenced from an RLS policy expression (`using (... auth_business_id()...)`,
-- `auth_account_type()`, ...). RLS policy expressions do NOT bypass the
-- EXECUTE privilege check — the `authenticated` role must retain EXECUTE on
-- them or every row read/write under RLS fails with "permission denied for
-- function". Verified by backend/src supabase pgLite tests
-- (rls-ledger-lockdown, database-audit): revoking from authenticated breaks
-- 5 RLS tests; keeping it passes all 17. Only trigger functions — invoked by
-- the DB as the table owner, never called by a role — are revoked from
-- authenticated.
--
-- Note: 0027_auth_leaked_password_protection must be enabled in the
-- Supabase Dashboard > Authentication > Password Settings. It cannot be
-- set via SQL migration.

-- 1. Secure internal migrations tracking table (may not exist on older deploys)
do $$
begin
  if to_regclass('public._migrations') is not null then
    alter table public._migrations enable row level security;
    revoke all on table public._migrations from anon, authenticated;
  end if;
end $$;

-- 2. Fix mutable search_path on trigger functions.
--    The previous ALTER FUNCTION may not have taken effect; re-apply with
--    fully qualified names to be explicit.
alter function public.set_updated_at() set search_path to public;
alter function public.bump_product_version() set search_path to public;
alter function public.stock_movements_bump_rollup() set search_path to public;

-- 3. Revoke EXECUTE from anon on all internal SECURITY DEFINER functions.
--    These are used exclusively by RLS policies (anon never reaches them —
--    RLS denies anon on the underlying tables) and are not PostgREST RPC
--    endpoints, so anon EXECUTE is dead surface. Wrapped in exception blocks:
--    if a function was already dropped, the migration continues cleanly.
do $$ begin revoke execute on function public.auth_account_type() from anon; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.auth_branch_ids() from anon; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.auth_business_id() from anon; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.auth_can_access_branch(uuid, uuid) from anon; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.auth_can_access_business(uuid) from anon; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.auth_is_branch_scoped_role() from anon; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.auth_role() from anon; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.auth_worker_has_capability(text) from anon; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.is_platform_admin() from anon; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.is_super_admin() from anon; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.handle_new_owner() from anon; exception when undefined_function then null; end $$;

-- 4. Revoke EXECUTE from authenticated ONLY on trigger functions. The DB
--    invokes them as the table owner during DML; authenticated never calls
--    them directly, so the grant is dead surface. Kept separate from the
--    RLS-referenced helpers above because those MUST stay executable.
do $$ begin revoke execute on function public.set_updated_at() from anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.bump_product_version() from anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.stock_movements_bump_rollup() from anon, authenticated; exception when undefined_function then null; end $$;