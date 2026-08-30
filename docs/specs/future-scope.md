# SPEC PACK: Future Scope (P2 — spec now, build when they enter the queue)

| | |
| --- | --- |
| Status | DRAFT for SPEC gate |
| Features | Master audit rows 12, 14, 15, 16, 17 |
| Rule | These are P2 because each adds a network dependency, device API, or hardware surface (perf doctrine §2.7.4). Specced now so the design is decided before the budget gate opens. |

---

## 12. Label / receipt customizer (P2)

**Objective:** Settings → Print: pick which fields appear on labels (Name / Price / Stock / Barcode) and choose from 2–3 layout cards; print A4 (browser) or thermal (via the Web Bluetooth work, row 16).

**Decisions:** field checkboxes + layout cards (one-column price tag, two-column shelf label, receipt-line); preview renders live from a selected product; print = `window.print()` with a print-only stylesheet (existing print styles in sales detail show the pattern); no new dependencies. The customizer is data, not code: one `labelLayout` config object per template.

**Verification:** pick fields → preview updates; print A4 matches the preview; thermal path waits on row 16.

## 14. Aging debtors 15/30/60/90 (P2)

**Objective:** Reports → one table: each debtor with balance aged into 15 / 30 / 60 / 90+ day buckets (from `customerCreditMovements` timestamps — derived, never stored).

**Decisions:** oldest-unpaid-first aging (FIFO by movement date — the honest method for informal credit); buckets color-coded (15 = neutral, 30 = warning, 60 = danger, 90+ = danger container); rows deep-link to Contacts?debtors + WhatsApp remind. Ships with the P&L work (row 6) since both are Reports additions.

**Verification:** seeded credit movements produce correct bucket totals; a 95-day-old debt lands in 90+.

## 15. Bill-payment commissions (P2)

**Objective:** optional airtime/data/bill payments inside the POS with a commission per transaction; the shop keeps the margin.

**Decisions:** needs an aggregator partner + backend (network dependency — the reason it's P2); a new product-like catalog entry "Airtime ₦100" with a commission field; sale completes as a normal ledger sale; the aggregator API call happens on the backend, not the app (keeps the app network-free); the till reconciles commissions at close day. **Gate: an aggregator contract must exist before spec-to-build.** Until then: do not build.

**Verification (when gated):** buy airtime → commission recorded → close-day shows commission income; offline behavior = queued like any sale (backend settles later).

## 16. Web Bluetooth thermal printing (P2)

**Objective:** pair a 58mm ESC/POS thermal printer via `navigator.bluetooth` and print receipts/labels directly — beating FigoBooks's companion-app approach.

**Decisions:** Settings → Print → "Pair 58mm printer" (device memory in localStorage, reconnects automatically); receipt/label payloads rendered to ESC/POS bytes (a small `escpos` encoder — dependency, ask-first); prints receipts after sales ("Print" outline button beside "New Sale"), labels from the customizer (row 12); Android Chrome only for v1 (Web Bluetooth support); graceful fallback to WhatsApp share when unsupported.

**Verification:** pair → print a real receipt on a 58mm printer; reconnect on app reopen; unsupported browser shows the WhatsApp fallback.

## 17. Multi-currency (P2)

**Objective:** record sales in USD (diaspora customers, cross-border trade) alongside NGN, with a config-driven rate.

**Decisions:** config-only for now (the audit already notes `currency: "NGN"` on the business profile); P2 adds: per-sale currency tag (NGN/USD), a saved rate per transaction (never a live-rate fetch — that's the network dependency; the owner types today's rate), reports convert to the home currency. **No live-rate API, no automatic conversion** — the rate is owner-confirmed at sale time.

**Verification:** a USD sale records with its rate; reports show both; the ledger stays in home currency (movements converted at the stored rate).

## 18. Order source tag (future queue — cut from P1 by the engineer vet, 2026-08-25)

**Objective:** ONE chip in the checkout sheet: Walk-in / WhatsApp / Instagram / Phone; default Walk-in; feeds a channel report.

**Why it was cut:** Bumpa's e-commerce channel model; a shop-floor POS serving walk-ins doesn't need a channel report. Adds a field to every sale for a question nobody asked.

**If it ever re-enters:** `Sale.source` field (type + sync schema migration), chip in the payment sheet, default Walk-in (zero extra taps), channel filter in Reports. Re-gate through DOUBT before building.

## 19. Quick-scan multi-scan upgrade (future queue — cut from P1 by the engineer vet, 2026-08-25)

**Objective:** the existing lazy-loaded `BarcodeScanner` gains the FigoBooks multi-scan flow: camera stays open, each scan adds a line to a live cart drawer, Scan More / Done.

**Why it was cut:** barcode scanning was already demoted (most stock is unbarcoded); the multi-scan drawer is polish on a minority path.

**If it ever re-enters:** drawer state in the POS browse step; Done commits to cart; camera closes only on Done or Cancel.

## 20. Lost-sale capture (future queue — cut from P1 by the engineer vet, 2026-08-25)

**Objective:** when a product is out and a customer asks, record it: "Asked but out" — stockouts become demand data.

**Why it was cut:** demand data, not a v1 need; reorder points already use real sales history.

**If it ever re-enters:** one quiet action on the out-of-stock state; per-product counter with dates; reorder urgency ranks asked-but-out products first.

---

## Cross-feature rules (future scope)

- Each feature re-enters the gate (DOUBT → SPEC → PLAN → BUILD → VERIFY → REVIEW) when it moves from P2 to build; this file is the SPEC half, already decided.
- Nothing here adds a bottom-nav tab, a network call on the critical path, or a stored balance.
- Rows 15 and 16 are gated on external reality (a partner contract; hardware validation) — they do not start until that gate opens.
