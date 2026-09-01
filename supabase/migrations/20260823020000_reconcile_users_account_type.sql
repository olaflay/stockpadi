-- Reconcile the two `account_type` columns on `users` vs `business_memberships`.
--
-- `business_memberships.account_type` is the documented authoritative tenant
-- account type (20260815150000_membership_account_type.sql), read by
-- resolve_account_context, auth_account_type(), and every authorization path.
-- `users.account_type` is a legacy duplicate that sync_apply_stock_count
-- additionally gates on. Left unguarded, the legacy `users_write` policy
-- (20260809140000) lets an in-tenant owner write `users.account_type` to a
-- value that diverges from the authoritative membership — a latent source of
-- authorization drift between the two columns for the same user.
--
-- This migration tightens `users_write` so a row can only be written when its
-- `account_type` (if set) agrees with the authoritative membership
-- account_type. It does not change who may write (still owner/admin within the
-- business); it only prevents the duplicate column from being set to a value
-- that contradicts the membership ledger.
--
-- See .agents/rules/database-and-rls.md (RLS is the enforcement boundary).

drop policy if exists users_write on users;

create policy users_write on users for all
  to authenticated
  using (business_id = auth_business_id() and auth_role() in ('owner', 'admin'))
  with check (
    business_id = auth_business_id()
    and auth_role() in ('owner', 'admin')
    and role <> 'super_admin'
    and (role not in ('owner', 'admin') or auth_role() = 'owner')
    and (
      users.account_type is null
      or exists (
        select 1 from public.business_memberships bm
        where bm.user_id = users.id
          and bm.business_id = users.business_id
          and bm.account_type = users.account_type
      )
    )
  );
