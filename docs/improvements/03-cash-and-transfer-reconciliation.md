# Improvement: Multi-Channel Daily Balancing (Cash at Hand & Bank Transfers)

## 1. Context & Research

In Nigerian informal and semi-formal retail (1–6 branches, general merchandise, provisions, pharmacy, electronics), end-of-day reconciliation ("closing the till") is no longer a physical-cash-only ritual. 

### The Operational Reality:
- **Cash Payments (40–60%):** Physical Naira notes in the drawer. Vulnerable to miscounting, untracked cash expenses (e.g. buying generator fuel or paying market loaders), and small theft.
- **Bank Transfers (30–50%):** Direct bank credits via OPay, PalmPay, Moniepoint, Kuda, GTBank, Zenith, etc. Vulnerable to "fake alerts", delayed SMS alerts, or staff mistakenly recording a sale as paid before the alert drops in the owner's bank app.
- **POS Card Terminal (10–20%):** Card swipes/taps on an Android POS terminal. Balanced against the printed daily POS settlement slip.
- **Customer Credit (Owing):** Recorded in the customer credit ledger; excluded from cash/bank expected totals.

### The Problem in Existing POS Apps:
Most POS software assumes a single "Cash in Drawer" input field. When the cash variance is negative because half the day's sales were paid via direct bank transfer to the owner's OPay account, the cashier panics, and the reconciliation equation breaks.

---

## 2. The Multi-Channel Reconciliation Model

```
                    ┌─────────────────────────────────────────┐
                    │    End of Day Reconciliation Engine     │
                    └─────────────────────────────────────────┘
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        ▼                                ▼                                ▼
 [ 1. CASH IN TILL ]           [ 2. BANK TRANSFERS ]            [ 3. POS TERMINAL ]
 Count Physical Naira          Verify Bank Alerts               Verify POS Slip
 • Cash Sales                  • Transfer Sales                 • POS Card Sales
 • (-) Cash Expenses           • Compare vs Bank Balance        • Compare vs POS Batch Slip
 • Expected = Sales - Expenses • Variance = Alert - Expected    • Variance = Slip - Expected
```

### The Balancing Equations:

1. **Cash Equation:**
   $$\text{Expected Cash} = \text{Opening Float} + \sum \text{Cash Payments} - \sum \text{Cash Expenses} - \sum \text{Cash Draws}$$
   $$\text{Cash Variance} = \text{Counted Cash} - \text{Expected Cash}$$

2. **Bank Transfer Equation:**
   $$\text{Expected Transfers} = \sum \text{Transfer Payments}$$
   $$\text{Transfer Variance} = \text{Verified Bank Alert Total} - \text{Expected Transfers}$$

3. **POS Card Equation:**
   $$\text{Expected POS} = \sum \text{POS Terminal Payments}$$
   $$\text{POS Variance} = \text{Printed POS Summary Slip Total} - \text{Expected POS}$$

4. **Overall Day Balance:**
   $$\text{Total Net Variance} = \text{Cash Variance} + \text{Transfer Variance} + \text{POS Variance}$$
   *Balanced when $|\text{Total Net Variance}| < ₦1.00$*

---

## 3. Minimalist UX (Samsung One UI)

- **Segmented / Accordion Channel Inputs:**
  - Cash Count (with quick optional denomination calculator: ₦1000, ₦500, ₦200, ₦100, ₦50, ₦20).
  - Verified Bank Transfers (single input for total bank alerts received).
  - POS Terminal Slip Total (single input from printed POS batch slip).
- **Instant Visual Reconciliation Chips:**
  - 🟢 **Cash:** Balanced (₦0 variance)
  - 🟢 **Transfers:** Verified (₦0 variance)
  - 🔴 **POS / Cash Discrepancy:** Highlighted in red with exact variance amount.
- **WhatsApp Nightly Summary:**
  1-tap formatted text generated and sent to the shop owner:
  > *"End of Day Summary for Kola Provisions (Main Branch) — 30 Aug 2026*
  > *Total Sales: ₦85,000 (18 sales)*
  > *• Cash: ₦45,000 (Counted: ₦45,000, Variance: ₦0)*
  > *• Transfer: ₦30,000 (Verified: ₦30,000, Variance: ₦0)*
  > *• POS Card: ₦10,000 (Slip: ₦10,000, Variance: ₦0)*
  > *Expenses: ₦3,500 (Fuel)*
  > *Net Profit: ₦22,400*
  > *Status: Fully Balanced ✅"*

---

## 4. Seamless Data Architecture (Non-Destructive)

- **Preserves Immutability:** Sales, payment legs, and stock movements are never modified during close-day.
- **Reconciliation Snapshot:** Stored as an append-only `reconciliations` record:
  - `branchId`, `date`, `openingFloat`, `countedCash`, `expectedCash`, `cashVariance`, `verifiedTransfers`, `expectedTransfers`, `transferVariance`, `countedPos`, `expectedPos`, `posVariance`, `notes`, `createdByUserId`, `createdAtLocal`.
- **Local-First:** Computed entirely from local IndexedDB (`db.sales`, `db.expenses`), works 100% offline, and syncs via the sync queue when online.
