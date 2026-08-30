# SPEC: Multi-Channel Cash & Transfer Reconciliation

| | |
| --- | --- |
| Status | DRAFT for SPEC gate |
| Feature | Close Day Multi-Channel Balancing (Audit row 4.6, Q2, Q7) |
| References | `docs/improvements/03-cash-and-transfer-reconciliation.md`, `docs/PRD.md` §10.2 |
| Date | 2026-08-30 |

## 1. DOUBT — why this, why now

**The evidence:** In Nigerian retail, 30% to 50% of revenue is paid via direct bank transfer (OPay, PalmPay, Moniepoint, traditional banks) rather than physical cash in the till. Traditional POS apps only provide a single "Cash Counted" field, which generates misleading negative cash variances and causes daily disputes between cashiers and shop owners over unverified transfer alerts.

**Verdict:** BUILD (P0 for Close Day accuracy).

## 2. Objective

Enable cashiers and shop owners to close their day by independently counting/verifying:
1. **Physical Cash in Drawer** (with optional denomination counter).
2. **Bank Transfers Received** (verified against bank app credit alerts).
3. **POS Terminal Card Slip Total** (verified against the printed terminal summary).

Provide instant per-channel variance feedback, gross/net profit metrics, and a 1-tap WhatsApp summary for the owner.

**Success criteria (measurable):**
- Full multi-channel close-day completed in under 60 seconds.
- Per-channel variance computed live on keypress with zero latency.
- 100% offline-first execution via local Dexie queries.
- Clean 1-tap WhatsApp summary preformatted with exact variances and net profit.

## 3. The Flow (decided)

1. **Today's Overview:** Displays total sales, gross profit, net profit, and total expenses.
2. **Channel Reconciliation Cards:**
   - **Cash in Drawer:** Expected (Cash Sales − Cash Expenses) vs Counted Cash (Input).
   - **Bank Transfers:** Expected (Transfer Sales) vs Verified Transfers (Input).
   - **POS Terminal:** Expected (Card Sales) vs POS Slip Total (Input).
3. **Variance Summary & Badge:**
   - Shows live individual variances and overall day balance status (`Balanced ✅` or `Discrepancy ⚠️`).
4. **Submit Close Day:**
   - Saves atomic reconciliation snapshot into local Dexie & queues for cloud sync.
   - Generates WhatsApp summary link for owner review.

## 4. Rules & Formulas

1. $\text{Expected Cash} = \sum \text{Cash Sales} - \sum \text{Cash Expenses}$.
2. $\text{Cash Variance} = \text{Counted Cash} - \text{Expected Cash}$.
3. $\text{Expected Transfer} = \sum \text{Transfer Sales}$.
4. $\text{Transfer Variance} = \text{Verified Transfer} - \text{Expected Transfer}$.
5. $\text{Expected POS} = \sum \text{POS Sales}$.
6. $\text{POS Variance} = \text{Counted POS Slip} - \text{Expected POS}$.
7. Never mutate existing `sales` or `stock_movements`. The reconciliation is strictly an append-only log.

## 5. Data Schema

Local table / sync payload:
```ts
export interface MultiChannelReconciliation {
  id: string;
  businessId?: string;
  clientId: string;
  branchId: string;
  dateIso: string;
  openingFloat: number;
  expectedCash: number;
  countedCash: number;
  cashVariance: number;
  expectedTransfer: number;
  verifiedTransfer: number;
  transferVariance: number;
  expectedPos: number;
  countedPos: number;
  posVariance: number;
  totalExpenses: number;
  grossProfit: number;
  netProfit: number;
  notes: string | null;
  createdByUserId: string;
  createdAtLocal: string;
}
```

## 6. Verification

1. Seed 1 cash sale (₦5,000), 1 transfer sale (₦10,000), 1 POS sale (₦3,000), and 1 cash expense (₦1,000).
2. Assert Expected Cash = ₦4,000, Expected Transfer = ₦10,000, Expected POS = ₦3,000.
3. Input counted values and assert live variance calculations and balance status.
4. Verify WhatsApp summary string formatting matches exact numbers.

## 7. Next Gates

PLAN → BUILD → VERIFY → REVIEW.
