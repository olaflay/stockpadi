-- Closes the direct-PostgREST-write bypass flagged in the 2026-08-08 security
-- review. stock_movements_insert, sales_insert, sale_items_insert,
-- sale_payments_insert, customer_credit_movements_insert, and
-- stock_adjustments_insert (20260807054734_rls_policies.sql) only check role
-- and ownership — they don't and can't require that a write originated from
-- a sync_apply_* RPC. Since Supabase grants `authenticated` table-level
-- INSERT by default, any authenticated cashier/inventory_staff session could
-- POST directly to PostgREST and bypass every integrity check those RPCs
-- perform (price-vs-catalog validation, idempotency, the credit-ledger
-- write that must accompany a credit sale). See stock_movements_insert's own
-- comment, which already named this gap without closing it.
--
-- These six ledger tables become server-write-only: every legitimate write
-- goes through a sync_apply_* function, which is SECURITY DEFINER (runs as
-- the function owner, not the caller) and already restricted to
-- service_role (20260807081123_sync_apply_functions.sql and friends) — so
-- revoking INSERT from `authenticated` here does not affect those RPCs.
-- SELECT policies are untouched; reads still work exactly as before.

revoke insert on stock_movements from authenticated;
revoke insert on stock_adjustments from authenticated;
revoke insert on sales from authenticated;
revoke insert on sale_items from authenticated;
revoke insert on sale_payments from authenticated;
revoke insert on customer_credit_movements from authenticated;
