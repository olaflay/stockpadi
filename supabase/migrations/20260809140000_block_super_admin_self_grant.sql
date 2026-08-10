-- Closes a gap introduced by adding the super_admin role
-- (20260809130000_super_admin.sql) on top of the earlier owner/admin
-- privilege-escalation fix (20260809121500_fix_owner_admin_role_escalation.sql).
--
-- That earlier fix only required the ACTOR to already be an Owner to grant
-- 'owner' or 'admin' — it never anticipated a third, more privileged role.
-- Because the condition was `role not in ('owner','admin') or auth_role() =
-- 'owner'`, writing role = 'super_admin' satisfied the first branch (it's
-- neither 'owner' nor 'admin') and was allowed through to ANY actor already
-- passing the outer auth_role() in ('owner','admin') gate — meaning any
-- tenant's admin (or owner) could grant themselves 'super_admin' and gain
-- full cross-tenant platform access via the super_admin_all_* policies.
--
-- Fix: unconditionally block granting 'super_admin' through this
-- tenant-scoped policy. The only legitimate way to grant super_admin is via
-- the separate super_admin_all_users policy (requires the ACTOR to already
-- be super_admin) or the handle_new_owner trigger at account creation.

drop policy if exists users_write on users;

create policy users_write on users for all
  to authenticated
  using (business_id = auth_business_id() and auth_role() in ('owner', 'admin'))
  with check (
    business_id = auth_business_id()
    and auth_role() in ('owner', 'admin')
    and role <> 'super_admin'
    and (role not in ('owner', 'admin') or auth_role() = 'owner')
  );
