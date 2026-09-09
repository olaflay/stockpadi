-- Tighten reconciliation_records INSERT: a direct PostgREST insert (the only
-- RLS-governed path) must not let any business member claim a close day for a
-- branch they are not responsible for. The app writes real reconciliation
-- records through the reconciliation Edge Function (service role, bypasses
-- RLS), so this policy only guards the authenticated, tenant-scoped path.
--
-- Allowed to insert:
--   * the BUSINESS_OWNER of the tenant (any branch of their business), or
--   * a WORKER who is assigned to the branch in user_branches.
-- ADMIN (platform) is deliberately excluded: platform administrators do not
-- operate tenant branches.

drop policy if exists reconciliation_insert on public.reconciliation_records;
create policy reconciliation_insert on public.reconciliation_records
for insert to authenticated
with check (
  business_id = public.auth_business_id()
  and actor_user_id = auth.uid()
  and (
    public.auth_account_type() = 'BUSINESS_OWNER'
    or branch_id in (select public.auth_branch_ids())
  )
);