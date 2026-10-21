# OjàPadi — Product Roadmap, Commercial Tiers & Engineering Backlog

> **Single Source of Truth for Product Evolution, Business Model, Technical Backlog & AI Innovation**  
> **Status:** Living Master Document (Diátaxis Reference & Planning)  
> **Governing Standards:** Bound by `docs/PRD.md`, `docs/LAUNCH_SCOPE.md`, and the 10 TRUST Promises (`.agents/rules/trust-standard.md`).

---

## 1. Verified Monorepo Baseline

Before scheduling new feature work or commercial expansions, all work is gated against the verified technical baseline:

| Dimension | Baseline Status | Authoritative Verification Source |
|---|---|---|
| **23 Launch Must-Haves** | **100% VERIFIED** | [LAUNCH_SCOPE.md](LAUNCH_SCOPE.md) |
| **All 9 Launch Blockers (B1–B9)** | **CLOSED & VERIFIED** | [LAUNCH_SCOPE.md](LAUNCH_SCOPE.md) |
| **Automated Test Suite** | **0 Failures** | Vitest & PGlite across `frontend/`, `backend/`, `supabase/` |
| **Synthetic 2G & Low-RAM Benchmark** | **VERIFIED** | `frontend/src/features/performance/__tests__/synthetic-profile.test.ts` (<80MB heap footprint under 5,000 items, sub-15ms catalog query) |
| **Owner Reconciliation Queue** | **CLOSED & VERIFIED** | `frontend/src/app/(app)/settings/data/reconciliation/page.tsx` |
| **Costing Invariants (WAC)** | **IMMUTABLY LOCKED** | [COSTING-AND-PRICING.md](COSTING-AND-PRICING.md) (IAS 2 compliant, moving weighted average) |

---

## 2. Commercial Model & Pricing Tiers

The commercial strategy targets lower- and mid-scale Nigerian retail merchants (1 to 6 branches) across grocery, pharmacy, electronics, and general retail.

### 2.1 The 3 Subscription Tiers

```
┌─────────────────────────────────────────────────────────────────┐
│ 🟢 1. FREE PLAN (₦0 / Forever)                                  │
│    • 1 Branch / Shop with up to 75 products                     │
│    • 100% Offline POS with instant WhatsApp receipts            │
│    • Customer debt tracking (kandirita / book)                  │
│    • Self-healing local synchronization                         │
│    • Zero barrier to adoption                                   │
├─────────────────────────────────────────────────────────────────┤
│ 🔵 2. PRO PLAN (₦5,000 / month)                                 │
│    • Unlimited products & barcode scanning                      │
│    • Up to 3 branches (independent stock per branch)            │
│    • Role-based Cashier vs. Manager vs. Owner logins            │
│    • Real Net Profit & Loss (moving weighted average cost)      │
│    • Stock audit trail & discrepancy alerts                     │
│    • 1-tap WhatsApp debt reminders                              │
├─────────────────────────────────────────────────────────────────┤
│ 🟣 3. ENTERPRISE (₦15,000 / month)                              │
│    • Up to 6 branches on a consolidated owner command center    │
│    • Custom logo & store branding on receipts                   │
│    • Inter-branch stock transfers & digital waybills            │
│    • Automated supplier restocking & purchase orders            │
│    • Priority VIP support                                       │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Server Infrastructure Costs & Scale Economics

The multi-tenant shared PostgreSQL architecture guarantees minimal incremental operational expenditure per onboarded merchant:

| Growth Stage | Merchant Count | Monthly Cloud OpEx | Monthly Revenue Run-Rate | Gross Margin |
|---|---|---|---|---|
| **Pilot / Launch** | Up to 150 Shops | **$0 / month** (Free tier Supabase + Vercel) | ₦0 – ₦250,000 / mo | **100% Free Pilot** |
| **Phase 1** | 1,000 Shops (250 paid) | **~$75 / month** (₦112,500) | **₦1,250,000 / month** | **91%** |
| **Phase 2** | 10,000 Shops (3,000 paid) | **~$540 / month** (₦810,000) | **₦21,200,000 / month** | **96%** |
| **Phase 3** | 100,000 Shops (30,000 paid) | **~$4,350 / month** (₦6.5M) | **₦200,000,000+ / month** | **97%** |

---

## 3. Phased Feature Roadmap

### 3.1 Phase 1: Core Launch Must-Haves (Complete)
- 100% offline-first sales terminal with cart holding & fast barcode search.
- Append-only stock movements and customer credit movements.
- Moving weighted average cost calculation snapshotted at time of sale.
- Multi-channel Close Day reconciliation (Cash, POS slip, Transfer, Drawer balance).
- Same-origin Node API synchronization gateway (`/api/sync/push`, `/api/sync/pull`).

### 3.2 Phase 2: Pro Tier & Operations Security (Next Up / V1.1)
1. **Multi-Branch Real-Time Overview**: Remote monitoring of sales and stock levels across up to 3 branches without traveling.
2. **Cashier vs. Owner Role Enforcement**: Cashiers strictly limited to POS and stock queries; margin views, cost prices, and historical records locked to Owner/Manager.
3. **Automated P&L Reporting**: Instant calculation: $\text{Net Profit} = \text{Revenue} - \text{COGS (WAC)} - \text{Expenses}$.
4. **Anti-Theft Stock Movement Inspector**: Comprehensive audit log view showing timestamp, user ID, reason, and quantity change for every item.
5. **Low-Stock & Expiry Notification Triggers**: Visual alerts when high-velocity items reach reorder thresholds or perishables approach expiry.
6. **1-Tap WhatsApp Debt Recovery**: Formatted debt collection template messages sent directly to debtors from customer ledger.
7. **Accounting CSV/Excel Data Export**: 1-click export of sales, expenses, and inventory ledgers for tax and bank documentation.

### 3.3 Phase 3: Enterprise Tier & Network Multipliers
1. **Inter-Branch Stock Transfers**: Formal digital waybills to move stock from central store/depot to satellite shops with dual-party sign-off.
2. **Custom Receipt Whitelabeling**: Merchant store logo, physical address, return policy, and promotional footer on printed and digital receipts.
3. **Supplier Restock Orders**: Automated generation of supplier purchase orders upon reaching minimum stock floors.
4. **Customer Loyalty Points**: Configurable point accumulation engine redeemable on future visits.
5. **Working Capital Inventory Credit Link**: Pre-qualified inventory financing recommendations based on verified on-chain sales history (earning 1.5%–2.5% origination fee).

---

## 4. Architectural & Infrastructure Backlog

These vetted technical initiatives address real-world physical constraints in emerging markets:

### 4.1 Backlog Task 1: $0/Month Off-Site Backups via Cloudflare R2 & GitHub Actions
- **Objective**: Provide automated enterprise off-site disaster backups for 1–6 branch retail without incurring vendor lock-in fees ($125/mo on managed enterprise tiers).
- **Architecture**:
  ```
  [Supabase Postgres] ──(DATABASE_URL)──► [GitHub Action: Nightly 02:00 UTC]
                                                   │
                                                   ▼
                                         [pg_dump --clean]
                                                   │
                                                   ▼
                                        [AES-256 GPG Encryption]
                                                   │
                                                   ▼
                                         [Cloudflare R2 Bucket]
                                         • 10 GB Free Storage
                                         • $0 Egress Fees Forever
                                         • 30 Daily / 12 Monthly Snaps
  ```
- **Execution Checklist**:
  - [ ] Provision Cloudflare R2 bucket `ojapadi-backups` with S3-compatible API credentials.
  - [ ] Configure repository secrets: `CF_R2_ACCOUNT_ID`, `CF_R2_ACCESS_KEY_ID`, `CF_R2_SECRET_ACCESS_KEY`, `BACKUP_ENCRYPTION_PASSPHRASE`.
  - [ ] Implement `.github/workflows/database-backup.yml` scheduled nightly with automated health verification and daily retention pruning.
  - [ ] Document restore rehearsal drill using `pg_restore` against local PGlite harness.

### 4.2 Backlog Task 2: Stranded Outbox Recovery & Hardware Resilience
- **Objective**: Prevent financial data loss when cashier hardware is destroyed, lost, or disconnected for extended durations (>14 days).
- **Governing Doctrine**: **Zero Silent Discard**. Mutations (`sale`, `payment`, `credit`, `expense`) are **never** auto-purged on timers. Deduplication by `client_id` guarantees idempotent convergence whenever the device returns online.
- **Implemented Foundation**:
  - `frontend/src/app/(app)/settings/data/reconciliation/page.tsx` implements the Owner Review Queue for permanent conflicts or data discrepancies.
  - Emergency Outbox Export mechanism allows exporting raw un-synced operations as encrypted JSON or QR streams to transfer to a backup phone.
- **Pending V1.1 Extension**:
  - [ ] Schema migration for `device_heartbeats` table in Supabase to track last sync timestamp, battery health, and pending outbox depth per register.
  - [ ] Owner Dashboard notification banner: alert owner when any till has not checked in for >48 hours with pending un-synced revenue.

### 4.3 Backlog Task 3: Physical Low-End Android Hardware Field Pilot
- **Objective**: Verify production performance on lowest-common-denominator retail devices before expanding pilot merchant rollouts.
- **Target Device Profile**:
  - Hardware: 2 GB RAM, entry quad/octa-core SoC (Tecno Pop 7 / itel A60 / Redmi A2).
  - OS: Android 11/12 Go Edition.
  - Network: Throttled 2G/3G mobile data with simulated 500ms–1,500ms latency.
- **Field Pilot Protocol**:
  1. Service worker install & cold start under airplane mode (<3s launch budget).
  2. 50 consecutive POS sales recorded in airplane mode with cart holds and line discounts.
  3. Forced process kill / RAM flush; instant cold launch verification (<50ms).
  4. 2G signal restoration: monitor atomic batch drain via `sync_apply_batch` without HTTP timeouts.
  5. Close-day drawer variance validation against physical cash count.

### 4.4 Backlog Task 4: Cashier Shift Sessions & Cash Drawer Ledger
- **Objective**: Support multi-cashier shared tablets with explicit shift handover balancing.
- **Mathematical Invariant**:
  $$\text{Expected Cash} = \text{Opening Float} + \text{Cash Sales} + \text{Credit Recoveries} - \text{Cash Expenses}$$
  $$\text{Drawer Variance} = \text{Actual Counted Cash} - \text{Expected Cash}$$
- **Data Model Specification**:
  ```sql
  create table cashier_shifts (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references businesses(id),
    branch_id uuid not null references branches(id),
    cashier_id uuid not null references local_users(id),
    device_id text not null,
    opened_at timestamptz not null default now(),
    closed_at timestamptz,
    opening_float_kobo bigint not null,
    expected_cash_kobo bigint,
    counted_cash_kobo bigint,
    variance_kobo bigint,
    closing_note text,
    status text not null default 'OPEN' check (status in ('OPEN', 'CLOSED', 'AUDITED'))
  );
  ```
- **Execution Checklist**:
  - [ ] Add `cashier_shifts` migration with tenant RLS isolation.
  - [ ] Implement Rapid 4-digit PIN Switch on POS header (switch active cashier without full Supabase Auth logout).
  - [ ] Generate Shift Handover Printout & WhatsApp slip showing float, sales in, expenses out, and variance.

---

## 5. AI & Automation Innovation Roadmap

All artificial intelligence and automated features are governed strictly by **TRUST Promise 10** (*"AI will never silently invent financial truth or execute sensitive actions without authorization"*).

### 5.1 The Safety Constitution: "AI Proposes, Human Disposes" (Poka-Yoke)
1. **Toil Automation**: AI handles manual transcription, receipt OCR, logistics cost proration, and anomaly detection.
2. **Mandatory Merchant Confirmation**: AI outputs exclusively to an editable review sheet (Samsung One UI Bottom Sheet). The merchant inspects, edits any item, and confirms with a single tap.
3. **Deterministic Ledger Boundary**: AI never writes directly to database ledger tables (`stock_movements`, `sales`, `payments`, `expenses`). It submits strictly validated payloads through standard application APIs.

### 5.2 Occam's Engineering Audit: De-Hyping AI vs. Deterministic Code

| Capability | Market Name | Computational Primitive | Rationale |
|---|---|---|---|
| **Waybill & Landed Cost** | "Smart Invoice OCR" | Hybrid: Cloud VLM + Local Pro-Rata Math | Vision model extracts line items; deterministic math prorates freight/haulage. |
| **Bank Transfer Verification** | "Instant Payment Match" | 100% Deterministic Regex + Cart Matcher | Sub-millisecond matching of SMS/bank alerts against open cart totals. Zero LLM cost/latency. |
| **Inflation Margin Shield** | "Price Protection AI" | Deterministic Branch Arithmetic | Flags products where current selling price yields <10% margin against new replacement cost. |
| **WhatsApp Debt Assistant** | "Smart Debt Collector" | Parameterized String Template | Structured templates prevent tone drift or incorrect money figures. |
| **Loss Prevention Analytics** | "Anti-Theft AI" | Statistical Outlier Engine (Z-Score) | Standard deviation analysis on stock adjustment and void logs. |
| **Rush-Hour Voice Tally** | "Voice-Assisted POS" | Speech-to-Intent (ASR) | **Deferred to V3**; noisy market environments require high ASR accuracy. |
| **CV Camera Shelf Auditor** | "Camera Shelf Auditor" | Object Detection Network | **Permanently Rejected**; high compute, messy informal display stalls low-end phones. |

### 5.3 5-Year Innovation Portfolio (2026–2031)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2026 (Launch & V1.1)                                                        │
│ • Deterministic Transfer Matching (Regex + SMS alert parser)                │
│ • Inflation Margin Realignment flag on purchase receipt                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2027 (V2: Commercial Expansion)                                             │
│ • Hybrid Waybill OCR & Conversational Landed Cost Engine (Alabaru / Keke)   │
│ • Statistical Loss Prevention Anomaly Detector (Z-scores on voids/skips)    │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2028–2029 (V2.5 – V3: Intelligence at Scale)                                │
│ • Merchant WhatsApp Copilot (Conversational daily digest & low stock alerts)│
│ • Multi-branch predictive demand forecasting                                │
├─────────────────────────────────────────────────────────────────────────────┤
│ PERMANENTLY REJECTED                                                        │
│ ❌ Autonomous financial writes (Violates TRUST Promise 10)                  │
│ ❌ CV Shelf Object Detection (Prohibitive hardware & cognitive load)        │
│ ❌ LLM-based transfer slip verification (High latency & hallucination risk) │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Legacy Document Provenance & Mapping

To maintain single-source-of-truth integrity while ensuring historical commit citations remain resolvable, earlier speculative and research scratchpads have been unified into this document:

| Legacy Document | Status | Disposition & Authority |
|---|---|---|
| `docs/AI-SUGGESTIONS.md` | Consolidated | Fully codified into **Section 5** above. Pointer stub preserved for legacy citations. |
| `docs/PENDING-TASKS-AND-RESEARCH.md` | Consolidated | Fully codified into **Sections 1, 4 & 6** above. Pointer stub preserved. |
| `docs/BUSINESS-MODEL-AND-ROADMAP.md` | Consolidated | Fully codified into **Sections 2 & 3** above. Pointer stub preserved. |
| `docs/RESEARCH-AND-PLAN.md` | Compatibility Pointer | Preserved as pointer to this file and `complete-improvement-audit.md`. |
