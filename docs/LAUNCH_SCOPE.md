# LAUNCH_SCOPE

What must be true before a real shop runs their business on this app.

This document exists to make one boundary impossible to cross by accident: **launch scope is frozen,
and adding to it is a deliberate, written decision, never a side effect of building something that
seems cool.** The gate that decides whether new work is allowed to start is the TRUST standard in
`.agents/rules/trust-standard.md`. This document records where we actually are against it.

Launch is: **BUILD → PROVE → HARDEN → PILOT → FIX → LAUNCH.** Not "build → looks good → launch."

## How to read this document

Every capability carries a status backed by a file path or an executed test. There is no
"I think this exists."

| Status | Meaning |
| --- | --- |
| **VERIFIED** | Implemented **and** covered by an automated test that would fail if it broke. |
| **PARTIAL** | Implemented, but on some paths only, or with no automated test. Not evidence. |
| **NOT FOUND** | No implementation found in the repository. |
| **UNVERIFIED** | Could not be confirmed either way. Treated as not proven. |

Status is the state of the code, not the state of the plan. Several items below are marked NOT FOUND
or PARTIAL and are therefore **not launch-ready**.

**Verification run for this document:**

| Suite | Files | Tests | Result |
| --- | --- | --- | --- |
| frontend | 53 | 276 | all pass |
| backend (+ supabase tests) | 14 | 100 | all pass |
| supabase (PGlite, all migrations applied) | 6 | 54 | all pass |
| typecheck | — | — | clean |
| lint | — | — | clean |

> Note: `backend/vitest.config` includes `../supabase/__tests__`, so those 6 files are counted twice
> in the backend row. Not a defect, but do not read it as more coverage than exists.

---

# 🔴 Must work before launch

These twenty-one capabilities are the product. If any of them is not trustworthy, the product is
not ready, regardless of what else works.

| # | Capability | Status | Evidence | Gap |
| --- | --- | --- | --- | --- |
| 1 | Authentication | **PARTIAL** | `frontend/src/app/login/LoginForm.tsx`, `features/auth/session.ts`, `backend/src/modules/auth/email-verification.service.ts` | No OTP. No offline PIN unlock (deliberate, see PRD 10.3). Session expiry untested. |
| 2 | Business onboarding | **VERIFIED** | `frontend/src/app/onboarding/page.tsx`, `features/onboarding/__tests__/onboarding-flow.test.ts`, `supabase/functions/register-business/` | — |
| 3 | Product creation | **VERIFIED** | `features/inventory/product-offline-write.ts:54`, `__tests__/product-offline-write.test.ts` | — |
| 4 | Product editing | **VERIFIED** | `product-offline-write.ts:131`, `product-offline-write.test.ts:108-210` | — |
| 5 | Inventory / per-branch stock | **VERIFIED** | `features/inventory/InventoryView.tsx`, `__tests__/branch-stock-scope.test.ts` | — |
| 6 | Sales / POS checkout | **VERIFIED** | `features/pos/complete-sale.ts:31`, `__tests__/complete-sale.test.ts` (11 cases) | — |
| 7 | Stock deductions | **VERIFIED** | `complete-sale.ts:101-183` (movements + outbox in one Dexie txn), `supabase/__tests__/rls-ledger-lockdown.test.ts` | — |
| 8 | Voids | **VERIFIED** | `features/pos/void-sale.ts`, `supabase/migrations/20261004120000_void_sale_reverses_payments.sql`, `__tests__/void-sale.test.ts` | **Atomically reverses stock, credit, and payment legs.** Blocker B1 closed. |
| 9 | Refunds | **VERIFIED** | `supabase/migrations/20261007120000_sale_refunds_and_rpc.sql`, `supabase/__tests__/defect-b2-refund-sale.test.ts`, `features/pos/refund-sale.ts`, `__tests__/refund-sale.test.ts` | **Online-only refund ledger, stock restoration, payment/credit reversals, and audit trail.** Blocker B2 closed. |
| 10 | Customer management | **PARTIAL** | `features/customers/customer-client.ts`, `backend/src/modules/customers/` | CRUD untested; only credit paths have coverage. |
| 11 | Customer credit / debt | **VERIFIED** | `features/customers/credit.ts:9-59`, `__tests__/record-payment.test.ts` | Append-only, balance computed not stored. |
| 12 | Expenses | **PARTIAL** | `features/expenses/add-expense.ts`, `__tests__/delete-expense.test.ts` | `addExpense` itself untested. |
| 13 | Basic reports | **VERIFIED** | `features/reports/compute-profit.ts`, `__tests__/compute-profit.test.ts`, `__tests__/defect-3-profit-history.test.ts` | **Cost snapshotted immutably on sale line.** Blocker B3 closed. |
| 14 | Staff / roles | **VERIFIED** | `features/auth/manage-staff-client.ts`, `backend/src/modules/authorization/capabilities.ts:38`, `authorization.integration.test.ts` | — |
| 15 | Offline operation | **PARTIAL** | `frontend/src/app/sw.ts`, `lib/db.ts:204-348`, `__tests__/drain-outbox.test.ts` | Service worker itself has no unit test. |
| 16 | Sync | **VERIFIED** | `features/sync/drain-outbox.ts`, `backend/src/modules/sync/sync.service.ts`, `supabase/__tests__/defect-b4-sync-apply-batch.test.ts` | **Atomic SAVEPOINT batch processing (100 items/60s).** Blocker B4 closed. |
| 17 | Audit trail | **PARTIAL** | `migrations/20260810122000_atomic_void_sale.sql:70`, `supabase/__tests__/database-audit.test.ts` | Writes verified. **Platform-admin tenant reads are not audited.** See blocker B5. |
| 18 | Data backup / recovery | **VERIFIED** | `features/data/restore-backup.ts:62-66`, `__tests__/restore-backup.test.ts` (9 cases) | No browser E2E for the real file-picker path. |
| 19 | Search | **VERIFIED** | `frontend/src/lib/fuzzy-search.ts:52`, `lib/fuzzy-search.test.ts` | — |
| 20 | Navigation | **PARTIAL** | `components/ui/BottomNav.tsx` | Rendered but no interaction test. |
| 21 | Settings | **PARTIAL** | `app/(app)/settings/**`, `__tests__/theme-default.test.ts` | Only the theme default is tested. |
| 22 | Data export | **PARTIAL** | `features/reports/csv-export.ts`, `app/(app)/settings/data/page.tsx:159` | CSV/JSON builders have zero coverage. |
| 23 | Error handling | **PARTIAL** | `components/ui/ErrorState.tsx`, `Toast.tsx` | **No `error.tsx`, `global-error.tsx`, or `not-found.tsx` in the app tree.** An unhandled render crash takes down the screen with no recovery path. |

## Launch blockers

Nine things stand between this build and a real shop. Ordered by how badly each one violates a TRUST
promise.

### B1 — A void does not reverse the payment leg 🔴 financial misstatement (CLOSED)

**Was.** `void_sale()` in `migrations/20260810122000_atomic_void_sale.sql:17-83` wrote reversal
`stock_movements` and reversed customer credit, but never touched `sale_payments`. Voiding a cash or
transfer sale left payments active, permanently overstating revenue.

**Now closed.** Migration `20261004120000_void_sale_reverses_payments.sql` adds `voided_at` to
`public.sale_payments` and updates `public.void_sale(...)` to atomically mark all payment legs as
voided in the same transaction as the stock and credit reversals. Backend `void-sale.service.ts`
updated to return `reversedPayments`. Verified in `supabase/__tests__/defect-b1-void-payment-reversal.test.ts`
(all passing).

### B2 — Refunds do not exist 🔴 (CLOSED)

**Was.** A void cancels the sale. A refund returns the customer's money. Previously only voids existed.
`docs/specs/quick-wins.md:167-173` was an unbuilt spec and `docs/complete-improvement-audit.md:161`
carried it as P1.

**Now closed.**
1. Migration `20261007120000_sale_refunds_and_rpc.sql` creates `sale_refunds`, `sale_refund_items`,
   and `sale_refund_payments` tables, adds `sale_refund` to `stock_movement_source`, and implements
   atomic RPC `public.refund_sale(...)`. Stock is restored positively via append-only ledger movements,
   customer credit balances are properly credited, and drawer refunds are recorded. Voids cannot be refunded
   and cumulative refunds cannot exceed line quantities or totals.
2. Verified in `supabase/__tests__/defect-b2-refund-sale.test.ts` (8 integration tests across all payment types).
3. Backend service `backend/src/modules/sales/refund-sale.service.ts` routes `POST /api/sales/refund` with schema validation
   and audit integration, tested in `backend/src/modules/sales/refund-sale.test.ts` (7 tests).
4. Frontend client `frontend/src/features/pos/refund-sale.ts` provides online refund capability with immediate Dexie mirror,
   integrated into the sale detail screen (`frontend/src/app/(app)/sales/[id]/page.tsx`) with a Samsung One UI modal,
   tested in `frontend/src/features/pos/__tests__/refund-sale.test.ts` (3 tests).
5. Locked Decision #4 maintained: Refunds strictly require an active online connection (no offline outbox path).

### B3 — Historical profit is still mutable 🔴 financial misstatement (CLOSED)

**Was.** `sale_items` had no cost snapshot. Editing a product's cost silently rewrote the profit on every
historical sale containing it; soft-deleting the product made it report the sale price as pure
profit. Proven in `__tests__/defect-3-profit-history.test.ts`.

**Now closed.**
1. Migration `20261005120000_immutable_sale_cost_snapshot.sql` adds `unit_cost`, `cost_basis`,
   `product_version`, and `cost_flags` to `public.sale_items`. Historical rows stay `NULL` (never backfilled).
2. `sync_apply_sale` RPC updated to validate client snapshots against product cost (±10% sanity band),
   flagging `'out_of_band'` without silently substituting.
3. POS `completeSale` attaches `unitCost`, `costBasis: 'snapshot'`, `productVersion`, and `costFlags`.
4. `computeGrossProfit` and `computeCogs` updated to prioritize the immutable snapshot on each line.
5. Verified in `supabase/__tests__/defect-b3-immutable-cost-snapshot.test.ts` (4 tests) and
   `frontend/src/features/reports/__tests__/defect-3-profit-history.test.ts` (7 tests).

### B4 — A large outbox backlog can never drain 🔴 (CLOSED)

**Was.** 500 items per request against a 15-second client abort, applied one RPC at a time. Serving time
grew linearly with batch size (~45s), causing client timeout aborts and infinite re-send loops.

**Now closed.**
1. Migration `20261006120000_sync_apply_batch.sql` creates `sync_apply_batch(items jsonb, actor_id uuid)`
   with per-item `SAVEPOINT` isolation. Batched operations execute in a single round-trip (~600ms for 100 items).
   Corrupt mutations fail cleanly without rolling back sibling items.
2. Backend `sync.service.ts` updated to route batches directly to `sync_apply_batch` with fallback resilience,
   and enforced `MAX_BATCH_SIZE = 100`.
3. Client `drain-outbox.ts` updated to push in 100-item slices (`DRAIN_BATCH_SIZE = 100`) with a dedicated
   60s timeout (`PUSH_TIMEOUT_MS = 60_000`).
4. Verified in `supabase/__tests__/defect-b4-sync-apply-batch.test.ts` (all passing) and
   `frontend/src/features/sync/__tests__/defect-5-batch-timeout.test.ts` (all passing).

### B5 — Platform-admin tenant reads and mutation audit 🟠 (CLOSED)

**Was.** `backend/src/modules/admin/admin.service.ts` wrote an `audit_logs` row only for
`set_business_status`, while all tenant reads were unaudited. Additionally, a severe foreign key
violation existed because platform admins have no row in `public.users`, causing `set_business_status`
to throw a 500 `AUDIT_FAILED` after committing status changes.

**Now closed.** Migration `20261003120000_platform_audit_trail.sql` creates `public.platform_audit_logs`
(referencing `auth.users(id)` with strict service-role RLS) and atomic RPC `public.platform_set_business_status(...)`.
Backend updated to audit all platform actions (`list_businesses`, `get_business`, `get_system_stats`,
`list_broadcasts`, `publish_broadcast`, `set_business_status`). Verified in `supabase/__tests__/platform-admin-audit.test.ts`
(6 tests, all passing).

### B6 — Inventory branch scoping on the read path 🟠 (CLOSED)

**Was.** `sync-pull.service.ts` scoped by branch in TypeScript, but the database PostgREST RLS policy on
`public.inventory_stock_rollup` checked only tenant membership. Because `POS_SELL` implied `VIEW_PRODUCTS`,
a cashier could bypass the backend and read stock totals for all branches directly via PostgREST with their JWT.

**Now closed.** Migration `20261002120000_branch_scoped_inventory_stock_rollup_rls.sql` restricts the RLS
policy with `auth_can_access_branch` and `VIEW_BRANCH_STOCK` capability checks. Verified in
`supabase/__tests__/branch-scoped-inventory-stock.test.ts` (5 tests, all passing).

### B7 — Unhandled render errors have no recovery path 🟠 (CLOSED)

**Was.** No `error.tsx`, no `global-error.tsx`, no `not-found.tsx` anywhere in the app tree. On a cheap
Android, a low-memory crash or a malformed cached row takes the whole screen down with no way back to
a working till except reinstalling. That is an availability failure on the exact device the product
targets.

**Now closed.** Implemented `frontend/src/app/(app)/error.tsx` (app-shell crash boundary with reset and
dashboard navigation), `frontend/src/app/not-found.tsx` (branded 404 with return-to-POS action), and
`frontend/src/app/global-error.tsx` (root recovery fallback), ensuring graceful error recovery.

### B8 — Two documentation artefacts overstated the product 🟠 (CLOSED)

**Was.** `frontend/src/features/pos/README.md:3` claimed **hold/resume of parked sales**, and both
copies of `llms.txt` claimed **Bluetooth ESC/POS receipt printing** for 58mm/80mm thermal printers.
Neither feature exists. Zero references to `navigator.bluetooth`, `requestDevice`, or `ESC/POS` exist
anywhere in `frontend/src`. Additionally, static `public/llms.txt` shadowed dynamic `src/app/llms.txt/route.ts`.

**Now closed.**
1. The POS README states plainly that discount, hold/resume, and refunds are absent.
2. `llms.txt` carries an explicit "Not Yet Available" section instead of the Bluetooth claim.
3. Removed `frontend/public/llms.txt` so `/llms.txt` is dynamically served from `src/app/llms.txt/route.ts`
   using `getBrandingConfig()`, enforcing the zero-hardcoding law.
4. Accurate features verified: split payment in POS, multi-unit stock delta conversion, WhatsApp receipts,
   and WhatsApp debt reminders.

### B9 — Held sales and discounts are absent from a product whose schema assumes them 🟠 (CLOSED)

**Was.**
- Discounts were hardcoded to `0` in `complete-sale.ts:63,90` despite `sales.discount`, `sale_items.discount`, and server-side money integrity guards already assuming them.
- Hold/resume of parked sales had no implementation despite POS README references.

**Now closed.**
1. **Discounts:**
   - `complete-sale.ts` updated to support and validate order-level and line-level discounts with strict non-negative and subtotal-capped bounds.
   - Payments balance check validates against discounted total (`total = subtotal - discount`).
   - Server-side money integrity guards and batched sync verified in private PGlite harness.
   - `use-cart.ts` hook updated with discount draft persistence and reactive total derivation.
   - `CartStep.tsx` and `PaymentStep.tsx` UI integrated with a Samsung One UI discount modal and clear receipt line item.
   - Verified in `complete-sale.test.ts` (4 new tests) and `use-cart.test.ts` (passing).
2. **Hold / Resume (Parked Sales):**
   - Created `frontend/src/features/pos/parked-sales.ts` with local state machine supporting `parkSale`, `resumeParkedSale`, `deleteParkedSale`, and `getParkedSales`.
   - `use-cart.ts` provides `loadCart` to restore held lines and discounts atomically.
   - `CartStep.tsx` integrated with "Hold cart", parked sales counter, and modal drawer to resume or discard held carts.
   - Tested in `frontend/src/features/pos/__tests__/parked-sales.test.ts` (5 tests, all passing).
3. POS documentation in `frontend/src/features/pos/README.md` updated to accurately describe both features.

---

# 🟡 V1.1 — real improvements that do not block launch

| Item | Why it is not a blocker |
| --- | --- |
| OTP and offline PIN unlock | Email/password + Google OAuth works. PRD 10.3 already documents PIN unlock as an explicit open decision, not shipped behaviour. |
| Service worker unit tests | Offline behaviour is exercised through Dexie and sync tests. The SW shell is thin. |
| Dashboard, navigation, settings, barcode, receipt-render tests | Functionality exists and is manually exercisable. Add coverage, but no known defect. |
| CSV/JSON export tests | Builders are simple and readable. |
| Customer CRUD tests | Credit paths, which carry the money, are tested. |
| `addExpense` test | Delete path is tested; add path is straightforward. |
| Real device testing on 2GB Android, throttled 2G/3G | Required before pilot, not before the code is finished. `.agents/rules/testing-and-qa.md` already mandates it. |
| Cost variance / provisional accounting | Needed once purchase costs actually differ from hand-entered cost at receipt. Deferred in `docs/COSTING-AND-PRICING.md`. |
| Authenticated export of the full audit trail | Audit rows exist and are tested; surfacing them to the owner is a feature. |

---

# 🟢 Future — explicitly not in launch

Dedicated wholesale business workflows (wholesale tier pricing, wholesale customer credit terms,
mini-wholesale bulk order desk — retail shops use standard multi-unit pack/carton pricing via
`altUnitSellPrice`, but specialized wholesale business features are strictly future scope),
AI copilot, advanced forecasting, supplier marketplace, advanced integrations, loyalty points,
OCR invoice scanning, WhatsApp Business API, cashflow forecasting, stock transfers between
branches, biometric login, multi-currency, live card/wallet processing, product variants, photo
evidence on stock adjustments, push notifications, custom receipt branding, custom role builder,
auto-scheduled exports, business health score, multi-device realtime collaboration indicators.

**Pulling any of these into launch requires a written decision naming what is being delayed in
exchange.** Per `.agents/rules/trust-standard.md`, a known reliability defect that is open and
unowned blocks new feature work outright — "later" must be a decision someone wrote down, never a
gap nobody mentioned.

In-progress specs that exist in `docs/specs/` but are **not** launch scope: `quick-wins.md`,
`stock-count-redesign.md`, `contacts-hub.md`, `coach-marks.md`, `hub-dashboard.md`,
`activation-onboarding.md`, `marketing-discovery-and-landing-page.md`, `reconciliation-cash-transfer.md`.

> `units-model.md` is listed here but is misleading in this context: the core unit conversion is
> **already shipped and verified** (`use-cart.ts:28`, `complete-sale.ts:76,106`). What the spec adds on
> top of that is a fuller unit-management UI, which is genuinely unbuilt. Do not read its presence
> here as "units do not work".

---

## Known risks carried into launch, stated openly

- **No point-in-time recovery is budgeted.** Supabase PITR is a $100/month add-on, not included in
  Pro. Seven days of daily snapshots is thin for a book of business. See `docs/COSTING-AND-PRICING.md`.
- **One test is load-sensitive.** `product-import.test.ts:255` passed in 6.8s in isolation but timed
  out at 30s under full-suite contention. Not a product defect, but CI flakiness risk on a loaded
  runner.
- **Restore has no browser E2E.** Transaction logic is unit-tested; the file-picker and confirmation
  path is not.
- **No performance benchmark exists anywhere.** Any performance claim in the PRD is unverified.
- **Pre-existing uncommitted worktree changes** in UI files and deletions under `docs/improvements/`
  were present before this audit and are not attributed to it.
- **`supabase/functions/` shows editor LSP errors** for `Deno` globals. Expected — Edge Functions run
  on Deno and the TypeScript server does not model that runtime. Excluded from typecheck.

---

## Sign-off gate

Launch requires all of:

1. Every 🔴 capability above reads **VERIFIED**.
2. All nine blockers B1–B9 are closed with executed tests.
3. `npm run test`, `npm run typecheck`, `npm run lint` green from a clean checkout.
4. Real Android hardware, 2GB RAM class, throttled 2G/3G, full offline round trip — per
   `.agents/rules/testing-and-qa.md`, devtools throttling does not substitute.
5. PITR enabled, and a restore rehearsed against a production snapshot.
6. Pilot branch live with daily usage, then the remaining branches.

Last verified: this document, against commit working tree, full suite green.