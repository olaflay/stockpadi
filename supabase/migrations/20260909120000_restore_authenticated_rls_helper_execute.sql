-- REMEDIATION: restore EXECUTE to the authenticated role on RLS helper
-- functions that 20260909110000_database_linter_warnings_fix.sql revoked.
--
-- Background: the 20260909110000 migration revoked EXECUTE on these SECURITY
-- DEFINER functions from anon AND authenticated. RLS policy expressions do
-- NOT bypass the EXECUTE privilege check: when an `authenticated` user queries
-- a table whose policy calls auth_business_id()/auth_account_type()/etc., the
-- executor requires the invoking role to hold EXECUTE on that function. With
-- the grant removed, every RLS-protected query from the app fails with
-- "permission denied for function public.auth_*". This was verified against
-- the backend pgLite RLS suite (rls-ledger-lockdown, database-audit): all 17
-- tests fail after the revoke and pass once EXECUTE is restored.
--
-- This migration re-grants EXECUTE to `authenticated` (the role PostgREST uses
-- for logged-in app users) on every authenticating helper still referenced by
-- a policy. `anon` stays revoked: anon never touches RLS-protected data.
-- Trigger-only functions (set_updated_at, bump_product_version,
-- stock_movements_bump_rollup, handle_new_owner) are deliberately excluded —
-- the DB invokes them as the table owner; no role EXECUTE grant is needed.
--
-- Idempotent: GRANT OR REPLACE-style outcome; re-running is a no-op.

grant execute on function public.auth_account_type() to authenticated;
grant execute on function public.auth_branch_ids() to authenticated;
grant execute on function public.auth_business_id() to authenticated;
grant execute on function public.auth_can_access_branch(uuid, uuid) to authenticated;
grant execute on function public.auth_can_access_business(uuid) to authenticated;
grant execute on function public.auth_is_branch_scoped_role() to authenticated;
grant execute on function public.auth_role() to authenticated;
grant execute on function public.auth_worker_has_capability(text) to authenticated;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.is_super_admin() to authenticated;