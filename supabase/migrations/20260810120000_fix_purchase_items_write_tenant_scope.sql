-- Fix: purchase_items_write never verified the parent purchase belonged to the
-- caller's business, unlike every other write policy in this file. Any
-- inventory_staff/manager/admin/owner from any tenant could insert, update,
-- or delete purchase_items rows against another business's purchase_id
-- (a guessable/enumerable uuid). Bring it in line with purchase_items_select,
-- which already scopes through the parent purchase correctly.

drop policy if exists purchase_items_write on purchase_items;

create policy purchase_items_write on purchase_items for all
  to authenticated
  using (
    auth_role() in ('owner', 'manager', 'inventory_staff', 'admin')
    and exists (
      select 1 from purchases
      where purchases.id = purchase_items.purchase_id
        and purchases.business_id = auth_business_id()
        and (not auth_is_branch_scoped_role() or purchases.branch_id in (select auth_branch_ids()))
    )
  )
  with check (
    auth_role() in ('owner', 'manager', 'inventory_staff', 'admin')
    and exists (
      select 1 from purchases
      where purchases.id = purchase_items.purchase_id
        and purchases.business_id = auth_business_id()
        and (not auth_is_branch_scoped_role() or purchases.branch_id in (select auth_branch_ids()))
    )
  );

-- Fix: audit_logs_insert only checked business_id, not actor_user_id, so any
-- authenticated user in a business could write an audit log row that frames
-- a different actor_user_id for a void/PIN-reset/role-change. Audit logs are
-- the record used to explain a disputed number to the client after the
-- fact; a forgeable actor field defeats that purpose. Server-side writers
-- (edge functions using the service-role key) bypass RLS entirely, so this
-- only tightens direct PostgREST/client writes.

drop policy if exists audit_logs_insert on audit_logs;

create policy audit_logs_insert on audit_logs for insert
  to authenticated
  with check (business_id = auth_business_id() and actor_user_id = auth.uid());
comment on policy audit_logs_insert on audit_logs is 'Every actor can write only their own audit trail entry; the application layer is responsible for calling this on every void/adjustment/role-change/PIN-reset, never optional.';
