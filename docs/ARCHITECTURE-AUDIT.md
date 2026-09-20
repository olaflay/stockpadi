# StockPadi architecture audit

Audit performed before the boundary cleanup on 2026-09-11.

## Current request and write paths

### Browser to remote

- Supabase Auth is used by `frontend/src/lib/supabase.ts` and the auth feature for session, sign-in, sign-out, refresh, and auth events.
- All frontend business reads/writes now use `operations/server-client.ts`; Supabase SDK access in the browser is limited to Auth (plus the unrelated password-breach lookup).
- `frontend/src/features/sync/drain-outbox.ts` now posts to the Node `/api/sync/push` route. The old Edge function is now a transport-only proxy with no sync business logic.
- `frontend/src/features/branches/reconcile-branches.ts` now reads through the Node API and quarantines unknown local branch IDs rather than remapping transactional data.
- The service worker targets the Node API route for background sync.

### Node backend routes currently registered

The raw HTTP application currently exposes:

- auth/account: account context, business registration, email verification, password update
- workers/admin: worker list/member/actions/audit and admin operations
- business resources: branches, products, categories, inventory, customers, suppliers/purchases, expenses
- domain operations: stock adjustment/count, purchase receipt, customer credit payment, sales list/void, reconciliation, reports

`/api/sync/push` and `/api/sync/pull` are now the canonical Node sync routes.

### Supabase

The database contains the authoritative relational state, RLS policies, and `sync_apply_*` functions. Node owns authentication context, worker authorization, error classification, idempotency metadata, RPC dispatch, and pull pagination. The legacy Edge endpoint only proxies to Node.

## Local entities

Dexie currently stores: business profile, branches, products, categories, customers, customer credit movements, stock movements, sales, outbox, local users/session, audit logs, expenses, suppliers, and purchases.

The active sync entity vocabulary is shared by `packages/contracts` and includes sale, stock adjustment, stock count submission, purchase receipt, customer, product, credit payment, expense, supplier, branch, and category.

## Authorization vocabularies

- Backend authorization and worker provisioning use `packages/contracts`.
- The deprecated Edge Function has a compatibility-only string map; new sync authorization is in Node and uses the shared vocabulary.
- A forward migration grants newly added worker capabilities to existing workers.

## Main risks identified

1. The browser boundary is converged; the deprecated Edge function must remain out of client routing.
2. Most ordinary inventory reads are now JWT-scoped, but some legacy backend read controllers still use the admin client.
3. Branch IDs are first-class synchronized mutations; unknown local IDs are retained for quarantine instead of being remapped.
4. Categories have a complete local/outbox/RPC lifecycle.
5. Pull uses an opaque server watermark plus per-dataset keyset positions; the client persists a cursor only after every page and dataset applies successfully.
6. Suppliers, credit movements, sale payment metadata, branches, and inventory projections are part of the unified pull contract.
7. Some legacy backend read controllers still use the admin client and should be migrated to the request-scoped read client in a follow-up boundary pass.

## Target transition order

1. Canonical contracts/errors and one authenticated frontend API client.
2. Node sync push with the existing RPCs; the drain no longer calls the Edge function.
3. Safe branch reconciliation, branch/category mutation support, and dependency metadata.
4. Complete outbox identity/retry/conflict semantics and durable pull diagnostics (current additive Dexie migrations).
5. Retire the redundant Edge transport after production zero-traffic confirmation.
6. Finish migrating the remaining legacy backend read controllers to the request-scoped client.
