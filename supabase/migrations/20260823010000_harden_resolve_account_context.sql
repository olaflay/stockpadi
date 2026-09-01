-- Harden resolve_account_context against cross-tenant enumeration.
--
-- Previously the parameterized form resolve_account_context(p_user_id uuid,
-- p_allow_pending_owner boolean) was granted to the `authenticated` role even
-- though it is SECURITY DEFINER and accepts an arbitrary caller-supplied
-- user id. Any authenticated user (including a tenant WORKER) could call
-- resolve_account_context('<victim-uuid>') to enumerate whether a given user
-- id is an active member of a business, retrieve that business_id, the
-- account_type, and the victim's assigned branch_ids — a platform-wide
-- membership / business-ownership oracle.
--
-- Only the zero-argument form (20260817000000) carries the default
-- p_user_id := auth.uid(), so it can only ever resolve the caller's OWN
-- context. That form remains available to `authenticated`. The parameterized
-- form is only ever called by the backend and the sync-push Edge Function,
-- both of which use the service_role client, so `authenticated` should never
-- execute it.
--
-- See .agents/rules/database-and-rls.md (tenant isolation on shared schema)
-- and supabase/functions/_shared/account-context.ts.

revoke execute on function public.resolve_account_context(uuid, boolean) from authenticated;
revoke execute on function public.resolve_account_context(uuid, boolean) from anon;
revoke execute on function public.resolve_account_context(uuid, boolean) from public;

-- Restore the grant for the privileged server callers only.
grant execute on function public.resolve_account_context(uuid, boolean) to service_role;
