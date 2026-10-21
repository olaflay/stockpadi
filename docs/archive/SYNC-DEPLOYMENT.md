# Sync deployment order

1. Apply the forward migrations in timestamp order, including `20260911000000_product_sync_convergence.sql`, `20260911090000_sync_branch_category_and_product_versions.sql`, `20260912100000_sync_convergence_branch_integrity.sql`, `20260912103000_branch_manager_assignments.sql`, and `20260918100000_category_case_insensitive_uniqueness.sql`. Never edit or reorder historical migrations.
2. Deploy the Node backend with `/api/sync/push`, `/api/sync/pull`, `/api/sync/health`, and `/api/business/profile`. It must have `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`; only the backend receives the service-role key. `SUPABASE_ANON_KEY` is required for JWT-scoped RLS reads and must be configured in Vercel even though it is not a secret.
3. Validate the PWA on the deployed HTTPS origin (or localhost). Service workers, camera access, and durable-storage APIs require a secure context; an HTTP LAN-IP test is not a valid production-offline test.
3. Confirm health, authenticated product reads, one product sync, and one opening-stock sync. Check that the product response precedes the stock response and that duplicate retries do not create a second ledger row.
4. Deploy the frontend. It uses Supabase Auth only in the browser; all business reads and writes go through the Node API. Existing IndexedDB databases upgrade additively through the current Dexie schema version.
5. Monitor `/api/sync/push` and `/api/sync/pull` response codes, retryable/permanent classifications, conflict counts, and the `syncDiagnostics` state visible in the client. The service worker does not replay `/api/sync/push`; Dexie outbox draining is the sole retry authority.
6. If the legacy `sync-push` Edge endpoint must remain during rollout, configure `STOCKPADI_BACKEND_URL`. It is a transport-only proxy to Node and contains no sync authorization or RPC logic. Remove it after the rollout window.

Rollback of application code must not roll back migrations. The new product columns are nullable/backward-compatible, and the RPC replacement is forward-compatible with complete snapshots. Pending local mutations remain in Dexie if the backend is unavailable.
