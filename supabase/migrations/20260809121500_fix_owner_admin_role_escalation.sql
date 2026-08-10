-- Closes a privilege-escalation gap: the original users_write policy's
-- `with check` only verified the ACTOR's current role was owner/admin — it
-- never constrained the NEW role value being written. Any admin could
-- therefore update their own (or anyone's) row to role = 'owner' via a
-- direct PostgREST call, entirely bypassing the manage-staff Edge Function,
-- and become a second Owner able to demote or deactivate the original one.
--
-- Fix: writing role = 'owner' or 'admin' now additionally requires the
-- ACTOR to already be an Owner. Admin retains full management of every
-- other role (manager, cashier, inventory_staff, accountant) — "Owner is
-- the final boss," per docs/RESEARCH-AND-PLAN.md 4.2, is now actually
-- enforced at the data layer, not just implied by the Edge Function's own
-- (separately fixed) logic in supabase/functions/manage-staff/index.ts.

drop policy if exists users_write on users;

create policy users_write on users for all
  to authenticated
  using (business_id = auth_business_id() and auth_role() in ('owner', 'admin'))
  with check (
    business_id = auth_business_id()
    and auth_role() in ('owner', 'admin')
    and (role not in ('owner', 'admin') or auth_role() = 'owner')
  );
