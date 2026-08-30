# StockPadi Specs & Implementation Index

The production specification index for StockPadi. Features follow the engineering gate order: **SPEC → PLAN → BUILD → VERIFY → REVIEW**.

---

## 1. Shipped / Implemented Specs (In Production)

| Feature / Spec | Audit Rows | Status | Verification & Delivery |
|---|---|---|---|
| [activation-onboarding.md](activation-onboarding.md) | 2, 2b | **SHIPPED** | 4-step walk (marketing, vertical catalog selection, first product + margin calculator, education superpowers). Tested in `onboarding-flow.test.ts`. |
| [reconciliation-cash-transfer.md](reconciliation-cash-transfer.md) | 4.6, Q2, Q7 | **SHIPPED** | Multi-channel Close Day: Cash in drawer + Bank Transfers + POS Card slip balancing + WhatsApp nightly digest. Tested in `multi-channel-reconciliation.test.ts`. |
| **Brand Identity & Vector Icon System** | 2h, Q1 | **SHIPPED** | Vector `<BrandLogo>`, 512×512 PWA squircle mark, automated App Router `/icon.svg`, and 7 lightweight inline illustrations. |
| **Modal & Bottom-Sheet System** | Q8 | **SHIPPED** | `<Modal>` sheet for zero-latency expense creation (`AddExpenseSheet`), debt collection, and dialogs. |
| **Centralized Date & Time Engine** | Q9 | **SHIPPED** | Local WAT midnight precision in `src/lib/date.ts`. 100% test coverage in `date.test.ts`. |

---

## 2. Active Roadmap Specs (Next Up)

| Spec | Audit Rows | Scope | Priority |
|---|---|---|---|
| [units-model.md](units-model.md) | 1 | Carton/pack/piece conversions from one shared base-unit stock pool; checkout unit toggle chip. | **P0** |
| [contacts-hub.md](contacts-hub.md) | 2j | Centralized Settings directory for Customers, Debtors (with live balance), and Suppliers with 1-tap WhatsApp reminders. | **P1** |
| [hub-dashboard.md](hub-dashboard.md) | 2c, 2d, 2e, 2i | Nav re-map (Home/Sell/Inventory/Reports/Settings), Home command center 2×2 quick actions, role landing, and jump links. | **P1** |
| [stock-count-redesign.md](stock-count-redesign.md) | 2f, 2g | Compact one-line product list with accordion form expansion, draft persistence on collapse, and `useDirtyGuard`. | **P1** |
| [coach-marks.md](coach-marks.md) | 2k | Dismissible first-visit highlights (2–4 marks per screen) replacing the multi-step guided tour. | **P1** |
| [quick-wins.md](quick-wins.md) | 3, 5–13, F1–F2, R1–R2 | Compact specs: Wholesale pricing, alerts banner, accountant export, and sync queue. | **P1/P2** |

---

## 3. Future Scope (Gated)

| Feature | Audit Rows | Spec File |
|---|---|---|
| Label/receipt customizer | 12 | [future-scope.md](future-scope.md) §12 — P2, thermal print paths |
| Aging debtors 30/60/90 | 14 | [future-scope.md](future-scope.md) §14 — P2, ships with P&L |
| Bill-payment commissions | 15 | [future-scope.md](future-scope.md) §15 — P2, gated on aggregator contract |
| Web Bluetooth thermal printing | 16 | [future-scope.md](future-scope.md) §16 — P2, gated on hardware validation |
| Multi-currency | 17 | [future-scope.md](future-scope.md) §17 — P2, manual owner exchange rate |
