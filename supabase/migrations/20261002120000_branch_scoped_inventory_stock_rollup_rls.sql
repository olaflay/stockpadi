-- Closes a confirmed cross-branch stock disclosure in inventory_stock_rollup.
--
-- The defect:
--   20260909100000_database_audit_integrity_and_indexes.sql created
--   inventory_stock_rollup_select with a single tenant predicate:
--
--     using (exists (select 1 from public.products
--                    where products.id = inventory_stock_rollup.product_id
--                      and public.auth_can_access_business(products.business_id)))
--
--   auth_can_access_business answers a question about the TENANT, never about
--   the BRANCH. For any active member of a business it returns true, so the
--   predicate constrained which businesses a caller could read and imposed no
--   branch restriction whatsoever.
--
-- Why that is exploitable, not theoretical:
--   1. inventory_stock_rollup is granted to `authenticated` and the Supabase
--      anon key and project URL are shipped in the web bundle, so the table is
--      reachable directly through PostgREST with nothing more than a worker's
--      own session token.
--   2. public.inventory_stock is declared security_invoker = true, so the view
--      inherits the base table policy rather than masking it.
--   3. POS_SELL implies VIEW_PRODUCTS in auth_worker_has_capability, so the
--      inner `exists (... from public.products ...)` subquery is satisfied by
--      the ordinary cashier. The only account shape the audit treated as
--      low-risk could read the whole business's stock.
--
--   The result is that a worker assigned to one branch can enumerate the
--   quantity of every product in every other branch of the same business.
--
-- The fix keeps the products join, because inventory_stock_rollup stores no
-- business_id of its own and products is the authoritative tenant link, then
-- adds the two checks that were missing:
--
--   * a BRANCH predicate, via the auth_can_access_branch helper that already
--     existed in 20260819010000 and was simply never wired into this policy.
--     It resolves ADMIN and BUSINESS_OWNER to true (both are documented as
--     seeing across all branches) and confines WORKER to auth_branch_ids().
--   * a CAPABILITY predicate for stock. The old policy borrowed VIEW_PRODUCTS
--     implicitly through the products subquery, which grants stock visibility
--     to anyone who can merely read the product catalogue. VIEW_BRANCH_STOCK is
--     the capability that actually governs stock, and auth_worker_has_capability
--     already treats POS_SELL, ADJUST_STOCK, SUBMIT_STOCK_COUNT and
--     RECEIVE_STOCK as implying it, so no legitimate cashier loses access.
--
-- The API-level filters in inventory.service.ts and sync-pull.service.ts are
-- left in place. They are defence in depth, not the control: a browser-held JWT
-- bypasses them entirely, which is precisely how this leak was reachable.
--
-- Evidence: supabase/__tests__/branch-scoped-inventory-stock.test.ts, which
-- fails against the previous policy and passes against this one.

drop policy if exists inventory_stock_rollup_select on public.inventory_stock_rollup;

create policy inventory_stock_rollup_select on public.inventory_stock_rollup
  for select to authenticated
  using (
    exists (
      select 1
      from public.products
      where products.id = inventory_stock_rollup.product_id
        and public.auth_can_access_branch(
              products.business_id,
              inventory_stock_rollup.branch_id
            )
    )
    and (
      public.auth_account_type() is distinct from 'WORKER'
      or public.auth_worker_has_capability('VIEW_BRANCH_STOCK')
    )
  );
