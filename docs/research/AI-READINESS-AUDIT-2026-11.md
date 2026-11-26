# AI readiness audit — November 2026

**Authority:** Evidence report only. `docs/LAUNCH_SCOPE.md`, `AGENTS.md`, and the TRUST Standard remain controlling.

**Source brief:** [`AI-LAYER-VOICE-CHAT-IMAGE-ENTRY.md`](AI-LAYER-VOICE-CHAT-IMAGE-ENTRY.md), especially §§16–20.

**Payment/proration supplement:** [`AI-PAYMENT-AND-PRORATION-RESEARCH-2026-11.md`](AI-PAYMENT-AND-PRORATION-RESEARCH-2026-11.md)

## Gate result

**AI feature implementation is blocked.** The repository has strong ledger, idempotency, immutable-cost, authorization, backup, and offline foundations, but it does not yet meet the source brief's Tier 0 requirements. The launch boundary also classifies AI/OCR/voice as Future experiments, not launch scope. Work may safely close prerequisites and build disabled-by-default infrastructure, but no model-backed user feature may be enabled until the owner explicitly promotes a bounded experiment and every gate below passes.

## Repository checklist

| # | Requirement | Status | Evidence | Gap / required resolution | Risk | Effort |
|---|---|---|---|---|---|---|
| 1 | Catalogue IDs, base unit, conversions | Partial | `frontend/src/types/product.ts`; unit fields are consumed by POS and imports | No canonical conversion-table entity; conversion behavior remains embedded in product/unit choices | High | L |
| 2 | Product/contact aliases | Missing | No alias entity or repository found | Add tenant-scoped aliases with normalized uniqueness, provenance, and confirmed-learning rules | High | M |
| 3 | Cost records and cost on each sale | Done | `frontend/src/features/pos/complete-sale.ts`; migration `20261005120000_immutable_sale_cost_snapshot.sql`; immutable-cost tests | Preserve NULL for unknown historical cost | Low | — |
| 4 | Cost-edit audit trail | Partial | Purchase and adjustment audit paths exist; moving-average migration exists | Prove every direct catalogue cost edit writes an attributable audit record | High | M |
| 5 | Contacts/debts direction, partial/overpayments, nickname | Partial | Delta credit ledger and `record-payment.ts` support partial deltas | No explicit debt direction/nickname model; overpayment semantics need contract tests | High | M |
| 6 | One command function for every write | Missing | Writes are distributed across `completeSale`, `receivePurchase`, `addExpense`, `recordCreditPayment`, product/branch/contact writers | Introduce a typed command dispatcher incrementally; do not replace proven atomic transactions in one rewrite | Critical | L |
| 7 | Reversals instead of financial edit/delete | Partial | Online sale void/refund and expense reversal exist | Inventory/count and every future AI-confirmed financial action need one documented reversible command contract | Critical | M |
| 8 | Client IDs and idempotency keys | Done | Shared outbox contract, Dexie v12 migration, sync replay tests | Keep mandatory in every new command | Low | — |
| 9 | Event time separate from recorded time | Partial | Local event timestamps and server timestamps both exist on several ledgers | Names and availability are inconsistent across expenses, purchases, payments and settings | High | L |
| 10 | Draft state outside ledger | Missing | No AI draft store exists | Add tenant-scoped expiring drafts; confirmation must dispatch a normal command | Critical | M |
| 11 | Adjustments, negative stock, stock count | Done | Adjustment writer, stock-count flow, ledger and convergence tests | AI may only draft these existing commands | Low | — |
| 12 | Expenses and owner drawings | Partial | Expenses and reversals exist | Owner drawings are not a distinct audited financial event | Medium | M |
| 13 | Roles and actor attribution | Partial | Backend authorization integration tests and audit logs exist | Prove actor/permission coverage for every command before exposing it to assistant tools | Critical | M |
| 14 | Export, backup, restore | Done | Data settings UI and transactional restore tests | Add AI consent/draft/provenance tables to export/delete policy when created | Low | S |
| 15 | Storage safety and sync status UI | Done | Persistence/quota checks, sync-health UI, offline status tests | Keep AI non-blocking and optional | Low | — |
| 16 | Timezone, day end, week start, language settings | Missing | No complete tenant settings model found | Add canonical settings before natural-language periods such as “today” can be trusted | High | L |
| 17 | Money stored as integers | Missing | Domain types and database use decimal/number values | Introduce a money minor-unit boundary without rewriting immutable historical figures | Critical | L |
| 18 | Schema versioning and migrations | Done | Dexie versions, Postgres migrations, compatibility contract | AI schemas need their own version and retention migrations | Low | S |
| 19 | Shared client/server schemas | Partial | `packages/contracts` generates backend contracts | Several feature inputs remain local interfaces rather than shared runtime schemas | High | L |
| 20 | Per-page read/write inventory | Missing | No canonical page data map found | Generate and maintain a page/tool data-access registry | Medium | M |
| 21 | Report inventory and shared assistant calculations | Partial | Report calculations and financial invariant tests exist | No complete report registry or parity contract consumable by assistant tools | Critical | L |

## Highest-risk gaps

1. No canonical typed command dispatcher across writes.
2. Money lacks a universal minor-unit boundary.
3. Draft/provenance/consent infrastructure does not exist.
4. Timezone/day-end/language semantics are incomplete.
5. Assistant/report calculation parity is not defined.
6. Payment/debt/landed-cost proration lacks a shared integer-minor-unit allocation contract and stable remainder policy.

## Accepted build order

1. **WP-A — safety contracts:** typed commands, runtime schemas, permission metadata, idempotency, draft isolation.
2. **WP-B — semantics:** tenant time settings, money boundary, aliases, contact/debt direction.
3. **WP-C — read-only tools:** report registry and deterministic local question tools with parity tests; no model.
4. **WP-D — governance backend:** consent, provenance, retention/deletion, quotas, kill switches, tracing; provider remains disabled.
5. **WP-E — evaluation harness:** recorded fixtures, language/accent slices, schema and validator failures, cost reporting.
6. **WP-F — bounded experiment:** only after explicit scope promotion, current primary-source vendor/legal research, target-device testing, and all gates pass.

## Declared external gates

- Nigerian data-protection compliance and contract language require qualified Nigerian counsel review. Engineering can prepare inventories, controls, and deletion evidence but cannot self-certify legal compliance.
- Nigerian-language voice accuracy requires consented representative recordings and native-speaker review; no code-only task can truthfully close that gate.
- Pricing and cost-per-shop require chosen provider terms and measured pilot traffic.
- The launch-scope conflict requires an explicit owner decision before any model-backed experience is enabled.
