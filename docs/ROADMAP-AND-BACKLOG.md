# OjàPadi — Product Roadmap, Commercial Tiers & Engineering Backlog

> **Single Source of Truth for Product Evolution, Business Model, Technical Backlog & AI Innovation**  
> **Status:** Living Master Document (Diátaxis Reference & Planning)  
> **Governing Standards:** Bound by `docs/PRD.md`, `docs/LAUNCH_SCOPE.md`, and the 10 TRUST Promises (`.agents/rules/trust-standard.md`).

> **2026-11-01 evidence correction:** `docs/MOBILE-PWA-FUTURE-PROOFING.md` is the current mobile/PWA feasibility review. Physical-device performance, deployed PostgreSQL RLS isolation, and backup restoration remain open release gates. Sections below that call synthetic or PGlite evidence “100% verified” are historical overclaims and must not be used as launch evidence until reconciled.

---

## How to use this roadmap

This document answers four different questions without mixing them:

1. **Can the current product launch?** See Section 1 and Queue 0.
2. **What is next after release evidence closes?** See Queue 1.
3. **What may enter planning later?** See Queues 2 and 3.
4. **What is explicitly excluded?** See Queue 4.

`docs/LAUNCH_SCOPE.md` remains authoritative for the frozen Must/V1.1/Future boundary. This roadmap
may add sequencing and gates, but cannot silently promote an item into launch.

### Status vocabulary

| Status | Meaning |
| --- | --- |
| **Release gate** | Required evidence before pilot expansion; not optional feature work |
| **Approved next** | Qualified work that may start after higher-priority reliability gates close |
| **Discovery** | Problem is credible, but architecture or identity decisions are unresolved |
| **Experiment** | May run only after its written entry metrics, safety controls, and kill criteria pass |
| **Removed** | Not part of the roadmap; re-entry requires new merchant evidence and a written tradeoff |

### Precedence

Queue order is mandatory: **release evidence → operational reliability → multi-branch controls →
validated experiments**. A known unowned reliability defect stops lower queues.

---

## 1. Verified Monorepo Baseline

Before scheduling new feature work or commercial expansions, all work is gated against the verified technical baseline:

| Dimension | Baseline Status | Authoritative Verification Source |
|---|---|---|
| **23 Launch Must-Haves** | **Automated coverage; release gates open** | [LAUNCH_SCOPE.md](LAUNCH_SCOPE.md) and `pwa_audit_report.md` |
| **All 9 Recorded Launch Blockers (B1–B9)** | **Code-closed; release evidence incomplete** | Real PostgreSQL RLS, restore rehearsal, and physical-device pilot remain open |
| **Automated Test Suite** | **0 Failures** | Vitest & PGlite across `frontend/`, `backend/`, `supabase/` |
| **Synthetic 2G & Low-RAM Benchmark** | **Synthetic regression evidence only** | `frontend/src/features/performance/__tests__/synthetic-profile.test.ts`; does not model Android memory, GPU, radio, storage eviction, or process death |
| **Owner Reconciliation Queue** | **CLOSED & VERIFIED** | `frontend/src/app/(app)/settings/data/reconciliation/page.tsx` |
| **Costing Invariants (WAC)** | **IMMUTABLY LOCKED** | [COSTING-AND-PRICING.md](COSTING-AND-PRICING.md) (IAS 2 compliant, moving weighted average) |

---

## 2. Commercial Model & Pricing Tiers

The commercial strategy targets lower- and mid-scale Nigerian retail merchants (1 to 6 branches) across grocery, pharmacy, electronics, and general retail.

### 2.1 Proposed subscription tiers — not yet an entitlement contract

Prices and limits below are hypotheses for validation. They must not be enforced or advertised as final until the owner resolves the open commercial decision and server-side downgrade/offline behaviour is specified.

No price, product cap, staff cap, or branch entitlement is final. The current landing page therefore offers pilot access rather than advertising conflicting Free/Pro/Enterprise contracts. Promotion requires an owner-approved entitlement table plus server-side enforcement, offline grace behaviour, owner export access, and downgrade tests.

### 2.2 Server Infrastructure Costs & Scale Economics

Infrastructure-only projections are not gross-margin evidence. Before scale, refresh vendor pricing and include backup/restore, monitoring, messaging, payment collection, onboarding, support and founder labour at replacement cost. Cohort conversion and retention—not hypothetical merchant counts—control commercial promotion.

---

## 3. Ordered delivery queues

### Queue 0 — close release evidence

These are release gates, not feature candidates.

| Work | Exit evidence | TRUST |
| --- | --- | --- |
| Physical low-end Android pilot | Named 2 GB device completes the offline sale, process-kill recovery, reconnect and close-day protocol | 1, 2, 6, 9 |
| Deployed PostgreSQL RLS isolation | Real tenant A/B read/write/count tests pass against deployed policies | 8 |
| Backup restoration | Production-format snapshot restores successfully within the accepted RPO/RTO | 7 |
| Full clean-checkout verification | Test, typecheck and lint pass from a clean checkout | 1–10 |

### Queue 1 — V1.1 reliability and owner control

This queue mirrors the canonical V1.1 boundary in `docs/LAUNCH_SCOPE.md`.

| Work | Status | Required gate | TRUST |
| --- | --- | --- | --- |
| OTP and offline PIN unlock | Approved next | Staff identity, revocation and shared-device behaviour accepted | 5, 8, 9 |
| Barcode scanner and receipt-render automated tests | Approved next | Hardware/browser fixtures identified | 1, 9 |
| Cost variance and provisional accounting | Approved next | Accounting treatment and immutable snapshot tests accepted | 4 |
| Authenticated full audit-trail export | Approved next | Authorization, tenant isolation and export audit tests pass | 5, 7, 8 |
| Device/outbox health warning | Approved next | Privacy review; only app version, last sync and oldest pending age retained | 1, 6, 7 |

The physical-device item formerly listed as V1.1 is promoted to Queue 0 because the current launch
sign-off explicitly requires it before pilot expansion.

### Queue 2 — operational growth

| Work | Status | Entry gate | TRUST |
| --- | --- | --- | --- |
| Multi-branch overview and branch-scoped permissions | Approved next | Queue 0 closed; real RLS evidence exists | 8, 9 |
| Deterministic P&L and stock-movement inspector | Approved next | Historical WAC and actor attribution tests pass | 3, 4, 5 |
| Cashier shifts and drawer handover | Discovery | Staff/offline identity ADR accepted | 4, 5, 9 |
| Inter-branch stock transfers | Discovery | Pending/accepted append-only event model and dual-party authorization accepted | 3, 5, 6, 8 |
| Supplier reorder drafts | Discovery | Reorder inputs are complete; merchant confirms before order creation | 3, 9 |
| Config-driven receipt and label layouts | Approved next | White-label boundary and print regression suite pass | 9 |
| Encrypted off-site backups and scheduled owner exports | Approved next | Restore rehearsal, secrets rotation and authorization design pass | 7, 8 |

### Queue 3 — measurable experiments

Nothing here is a delivery promise. Every item needs a pilot cohort, success metric, safety controls,
and kill criterion before architecture work.

| Experiment | Entry gate | Kill condition |
| --- | --- | --- |
| Product variants | Repeated pilot catalogue need plus migration/performance design | Adds checkout ambiguity or fails 5,000-product budget |
| Photo evidence for adjustments | Merchant demand plus offline compression/storage budget | Upload backlog harms sync or evidence cannot be access-controlled |
| Push notifications | Opt-in demand plus permission/delivery reliability tests | In-app alert performs as well or notification delivery is unreliable |
| OCR receiving draft | ≥95% required-field accuracy on representative documents | Any autonomous write or unacceptable correction rate |
| Consented WhatsApp Business workflow | Accepted cost, consent, retention and failure model | Opt-out/consent failure or unsustainable message economics |
| Loyalty | Core retention healthy and ≥10 paying merchants rank it top-three | No measurable repeat-purchase lift |
| Enterprise Voice Drafting | Gates in `docs/specs/enterprise-safe-automation.md` | Any unconfirmed mutation or failure to beat touch search |
| Read-only Operations Copilot | 100% numeric citation and authorization isolation | Any mutation path, cross-tenant leak or uncited financial claim |
| Scenario planner | Explicit owner assumptions and deterministic engine | Users interpret scenarios as recorded facts |
| Platform passkeys | Recovery/revocation and target-device validation | Shared-device access becomes less reliable than PIN |

### Queue 4 — removed or prohibited

| Item | Decision |
| --- | --- |
| Wholesale workflows, supplier marketplace, multi-currency | Removed: outside the validated 1–6 branch retail problem |
| Unspecified “advanced integrations”, custom role builder, business health score | Removed: vague or unjustified complexity without an acceptance test |
| Live card/wallet processing | Prohibited under the locked payment-tag and PCI boundary |
| Generic realtime collaboration indicators | Removed; replaced by specific owner-visible device/outbox health |
| Write-capable generic AI, autonomous financial writes | Prohibited by TRUST 10 |
| Stored biometric identity, continuous listening, voice-triggered checkout | Prohibited; safe successors are passkeys and confirmed voice drafts |
| Computer-vision shelf audit and LLM payment/transfer verification | Permanently rejected for hardware cost or financial hallucination risk |

### Portfolio evidence

**High confidence:** transfers, inventory history, exports, employee access, and shift/cash controls
appear in the project's merchant requirements and current shipped-product documentation from
[Loyverse](https://loyverse.com/features) and
[Storeflow](https://www.storeflowng.com/features/).

**Medium confidence:** variants, notifications, loyalty, OCR, WhatsApp automation and hardware
integrations exist in the market but lack this product's paid-demand or representative pilot
evidence. They therefore remain experiments. `docs/MOBILE-PWA-FUTURE-PROOFING.md` independently
supports prioritising operational reliability and rejecting generic AI.

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
  - [ ] Privacy-reviewed device health record containing only app version, last successful sync, and oldest pending outbox age. No battery or employee-surveillance data.
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
  3. Forced process kill / RAM flush; cached usable POS verification against the <3s named-device budget.
  4. 2G signal restoration: monitor atomic batch drain via `sync_apply_batch` without HTTP timeouts.
  5. Close-day drawer variance validation against physical cash count.

### 4.4 Discovery: Cashier Shift Sessions & Cash Drawer Ledger
- **Objective**: Support multi-cashier shared tablets with explicit shift handover balancing.
- **Mathematical Invariant**:
  $$\text{Expected Cash} = \text{Opening Float} + \text{Cash Sales} + \text{Credit Recoveries} - \text{Cash Expenses}$$
  $$\text{Drawer Variance} = \text{Actual Counted Cash} - \text{Expected Cash}$$
- **Gate before any schema:** define the canonical staff actor, offline authorization, revocation, device binding, recovery and audit model in an accepted ADR. The earlier `local_users` proposal referenced no canonical table and is withdrawn.
- **Execution Checklist**:
  - [ ] Add `cashier_shifts` migration with tenant RLS isolation.
  - [ ] Implement Rapid 4-digit PIN Switch on POS header (switch active cashier without full Supabase Auth logout).
  - [ ] Generate Shift Handover Printout & WhatsApp slip showing float, sales in, expenses out, and variance.

---

## 5. Automation experiments — no generic AI product roadmap

All artificial intelligence and automated features are governed strictly by **TRUST Promise 10** (*"AI will never silently invent financial truth or execute sensitive actions without authorization"*).

### 5.1 The Safety Constitution: "AI Proposes, Human Disposes" (Poka-Yoke)
1. **Narrow Toil Automation**: A model may draft receipt/waybill transcription only after its experiment gate passes; logistics cost proration remains deterministic.
2. **Mandatory Merchant Confirmation**: AI outputs exclusively to an editable review sheet (Samsung One UI Bottom Sheet). The merchant inspects, edits any item, and confirms with a single tap.
3. **Deterministic Ledger Boundary**: AI never writes directly to database ledger tables (`stock_movements`, `sales`, `payments`, `expenses`). It submits strictly validated payloads through standard application APIs.

### 5.2 Occam's Engineering Audit: De-Hyping AI vs. Deterministic Code

| Capability | Market Name | Computational Primitive | Rationale |
|---|---|---|---|
| **Waybill & Landed Cost Draft** | "Smart Invoice OCR" | Conditional cloud extraction + local pro-rata math | Experiment only at ≥95% required-field accuracy; merchant confirms every field and deterministic math prorates freight/haulage. |
| **Inflation Margin Shield** | "Price Protection AI" | Deterministic Branch Arithmetic | Flags products where current selling price yields <10% margin against new replacement cost. |
| **WhatsApp Debt Assistant** | "Smart Debt Collector" | Parameterized String Template | Structured templates prevent tone drift or incorrect money figures. |
| **Neutral Anomaly Review** | "Loss Review" | Statistical outlier rules | Experiment only after a low false-positive threshold is defined; never labels an employee as dishonest. |
| **Enterprise Voice Drafting** | "Voice-Assisted POS" | Push-to-talk speech-to-draft | Experiment only: constrained vocabulary, visible transcript and matched lines, explicit confirmation, no direct ledger write, privacy disclosure, and full non-voice fallback. |
| **CV Camera Shelf Auditor** | "Camera Shelf Auditor" | Object Detection Network | **Permanently Rejected**; high compute, messy informal display stalls low-end phones. |

### 5.3 Portfolio rule

There is no date-led AI portfolio. Narrow experiments enter only after the operational roadmap is
reliable and their documented evidence gate passes. Write-capable generic AI, autonomous financial
writes, computer-vision shelf audit, and LLM transfer verification are not roadmap items. Voice and
operations assistance may proceed only through the bounded enterprise-safe designs in
`docs/specs/enterprise-safe-automation.md`.

---

## 6. Legacy Document Provenance & Mapping

To maintain single-source-of-truth integrity while ensuring historical commit citations remain resolvable, earlier speculative and research scratchpads have been unified into this document:

| Legacy Document | Status | Disposition & Authority |
|---|---|---|
| `docs/AI-SUGGESTIONS.md` | Consolidated | Fully codified into **Section 5** above. Pointer stub preserved for legacy citations. |
| `docs/PENDING-TASKS-AND-RESEARCH.md` | Consolidated | Fully codified into **Sections 1, 4 & 6** above. Pointer stub preserved. |
| `docs/BUSINESS-MODEL-AND-ROADMAP.md` | Consolidated | Fully codified into **Sections 2 & 3** above. Pointer stub preserved. |
| `docs/RESEARCH-AND-PLAN.md` | Compatibility Pointer | Preserved as pointer to this file and `complete-improvement-audit.md`. |
