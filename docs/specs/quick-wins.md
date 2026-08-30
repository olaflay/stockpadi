# SPEC PACK: Quick Wins (compact specs for the remaining P1 features)

| | |
| --- | --- |
| Status | DRAFT for SPEC gate (each section is its own reviewable unit) |
| Features | Master audit rows 2b, 2h, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13 + quick-scan upgrade |
| Rule | Every feature here: Dexie-local or static assets, zero network on the critical path, one primary button, plain copy (performance doctrine §2.7) |

---

## 2b. Admin activation queue (P1, backend)

**Objective:** operator screen listing pending signups (name, business type, phone, time) with Activate / Reject; activation flips the status → shop-live notification → onboarding walk unlocks (activation-onboarding spec).

**Decisions:** one backend endpoint (`POST /api/admin/activate`), operator auth = existing admin role; notification reuses the Brevo mailer (KEEP IN SYNC headers). Pending accounts see only the awaiting-activation screen. No payments, no billing, no self-serve instant activation.

**Verification:** signup → pending in queue → activate → notification sent → walk unlocks; reject → clear message; queue works offline for the operator's list? (No — operator screen is online-only, it IS the backend.)

## 2h. Brand icon + link-share preview (P1, marketing)

**Objective:** shared links show the StockPadi mark, not the Vercel default.

**Decisions:** brand SVG mark (emerald `#0a6e4d`, the ledger/checkout motif — one square mark that reads at 16px AND 1200px) → `public/icon.svg` (replace), `public/apple-touch-icon.png` (180×180), `public/og.png` (1200×630, brand + "StockPadi — your shop, on your phone"), metadata: `icons`, `appleWebApp`, `openGraph` (title/description/image), `manifest` icons. All static, zero perf cost.

**Verification:** share a deployed link on WhatsApp/Telegram → branded preview; favicon shows in the tab; Lighthouse no errors.

## 3. "Who owes you" card (P1)

**Objective:** the debtor book on Home: top 3 debtors + total owed; ONE action per row: WhatsApp remind.

**Decisions:** computed from `getCustomerCreditBalance()` (derived, never stored); card shows "₦X owed · N debtors"; rows = name + balance + remind icon; tap row → Contacts?debtors (entry point per contacts spec); "View all" → Contacts debtors filter. Warning container tone (a trading signal, not danger).

**Verification:** after a credit sale, the card updates live; remind opens wa.me with the balance message.

## 4. Order source tag — CUT → future-scope (engineer vet 2026-08-25)

**Objective:** ONE chip in the checkout sheet: Walk-in / WhatsApp / Instagram / Phone; default Walk-in; saved on the sale; feeds a channel report.

**Engineer verdict:** Bumpa's e-commerce channel model; a shop-floor POS serving walk-ins doesn't need a channel report. Adds a field to every sale for a question nobody asked. Spec retained below for the future queue (see future-scope.md §18).

**Decisions:** `Sale.source` field (add to type + sync schema — ask-first migration); chip row in the payment sheet (selected = filled); default Walk-in so zero extra taps for the common case; channel report = Reports filter (P2 report view). No source-required rule (never block a sale on it).

**Verification:** sale saves with the chosen source; report filters by source; offline sale keeps the source and syncs.

## 5. Wholesale pricing (P1)

**Objective:** per-product wholesale price + a Retail/Wholesale toggle chip in checkout; wholesale price is per pack unit (consumes units-model).

**Decisions:** `Product.wholesalePrice` (nullable); checkout chip toggles Retail ↔ Wholesale when a wholesale price exists (chip hidden otherwise — minimal); wholesale qty uses the pack unit when units are set; reports show retail vs wholesale split.

**Verification:** toggle flips line totals; stock movement math unchanged (same base units); products without wholesale price show no chip.

## 6. Ledger → P&L + Balance Sheet (P1)

**Objective:** one profit report in plain language, computed from the ledger: revenue − cost of goods sold − expenses, per period; plus the balance-sheet view.

**Decisions:**
- New Reports tab section; period filter (today / this week / this month / custom).
- **COGS = weighted average, not latest cost** (financial-expert-audit §1): running WAC from `stock_movements` at sale time — the single cost field misstates profit whenever purchase prices change.
- P&L shape: Revenue (net of refunds/voids) → − COGS (WAC) = Gross profit → − Operating expenses (categorized) = Net profit. **Owner draws never appear in expenses** (§4 of the financial audit) — they reduce equity.
- Balance sheet (same feature, one toggle): Assets = cash in drawer + receivables (debtors) + inventory at WAC; Liabilities = payables (suppliers) + deposits held + VAT owed; Equity = assets − liabilities by construction.
- Zero stored balances (always derived); number drill-downs (tap revenue → the sales list); non-accountant labels ("What you sold", "What it cost you", "What you spent", "Profit", "What the shop owns", "What the shop owes").
- Missing cost prices are flagged (links to alerts banner) — a P&L with gaps is a warning, not a number.

**Verification:** seeded data produces a correct P&L by hand-checked arithmetic; missing cost prices are flagged (links to alerts banner).

## 7. Alerts banner (P1)

**Objective:** ONE quiet banner line on Home: "2 items low · 3 missing cost price · review" — tap → filtered inventory.

**Decisions:** computed from Dexie (low stock = at/below reorder threshold or zero; missing cost = `costPrice` null); tonal (warning container), never danger; tap opens Inventory pre-filtered; only shows when something is actually wrong (zero noise otherwise).

**Verification:** create a low-stock product → banner appears with the right count; tap lands on the filtered list.

## 8. Accent themes + dark mode (P1)(add to future scope)

**Objective:** Settings picker: 5 accent colors + the existing dark toggle.

**Decisions:** the theme pre-render script already exists (layout.tsx) — extend it to `stockpadi-accent` (5 values: emerald default, plus 4 safe AA pairs); the `--color-brand-accent` runtime override (branding.ts) already supports this; picker = chip row in Settings → Appearance; dark mode unchanged. No dynamic color (M3 multi-hue rejected).

**Verification:** pick an accent → entire app recolors instantly (no flash); dark + accent combos hold AA contrast; choice survives reload.

## 9. Credit recovery (P1)

**Objective:** every credit sale + debtor row carries ONE "Remind" action → WhatsApp with the balance.

**Decisions:** reuse `buildWhatsAppUrl` + the contacts spec templates; entry points: sale detail (part-paid/unpaid), customer detail (exists), debtor card, Contacts debtors filter. The message always includes balance + shop name. No SMS gateway (wa.me only, free)(make sure its secure ,no backend link is exposed, it should be a client side action).

**Verification:** each entry point opens wa.me to the right number with the right balance; offline works (link generation is local).

## 10. Returnable assets (P1)(add to future scope)

**Objective:** crates/kegs/pallets with deposits: product marked returnable + deposit field; sale records the deposit; a Returns screen deducts.

**Decisions:** `Product.isReturnable` + `depositAmount`; sale line shows "Includes ₦X deposit (returnable)"; returns = new ledger movement type (`return_deposit` — ask-first migration on stock-movement types); customer detail shows open returns per customer (ties into Contacts). **Deposits are liabilities, never revenue** (financial-expert-audit §3): sale revenue = goods only; the deposit is a customer-deposit liability line, reduced on return; forfeiture of unreturned deposits is an owner-confirmed income action, never automatic. Tracepos's differentiator; nobody else has it.

**Verification:** sell 10 crates → 10 open returns on the customer; return 4 → 6 open; deposits reconcile at close day.

## 11. PIN lock (P1)

**Objective:** optional 4-digit PIN to open the till (Settings toggle); shared-device shops.

**Decisions:** local PIN (hashed, salted — reuse the existing auth hash pattern); PIN pad = bottom sheet on app open/wake; 5 attempts → lockout with "ask your manager" (owner resets via Profile); PIN never leaves the device (no backend). Offline-first friendly.

**Verification:** enable → app prompts on open; wrong PIN ×5 locks; owner reset works; no PIN in any sync payload.

## 13. Sync queue detail (P1)

**Objective:** Data & Backup shows the outbox truth: pending / failed / total + last sync time.

**Decisions:** read the existing outbox tables (sync schema) with counts; numbers, not jargon; a "Retry failed" button (existing sync retry); last-sync timestamp from the sync meta. FigoBooks's reassurance pattern.

**Verification:** airplane mode → make sales → queue shows pending counts; reconnect → syncs → counts zero out.

## QS. Quick-scan upgrade (multi-scan) — CUT → future-scope (engineer vet 2026-08-25)

**Objective:** the existing `BarcodeScanner` (already in POS/products/product-form, lazy-loaded) gains the FigoBooks multi-scan flow: camera stays open, each scan adds a line to a live cart drawer, Scan More / Done.

**Engineer verdict:** barcode scanning was already demoted (most stock unbarcoded); the multi-scan drawer is polish on a minority path. The scanner works as-is. Spec retained for the future queue (see future-scope.md §19).

**Decisions:** keep the scanner component; add the drawer state (scanned lines with qty steppers) to the POS browse step; Done commits to cart; camera closes only on Done or Cancel. Never a permission prompt at onboarding (R&P §4.1).

**Verification:** 5 scans in a row without the camera closing; each line lands in the cart with correct qty; offline works.

## Q1. Expense receipt capture (P1)

**Objective:** attach a photo of a receipt to any expense; view it anytime. The accountant's rule: "save digital receipts for every expense."

**Decisions:** expense record gains an optional `receiptPhoto` (local blob in Dexie — offline, syncs with the table); capture via the existing camera path (no new permission ask at setup; permission requested only at the moment of capture); view = full-screen sheet. Never a required field (the receipt is hygiene, not a gate).

**Verification:** add expense with photo → view it; offline capture works; sync carries it.

## Q2. Transfer confirmation (P1)

**Objective:** transfer payment legs can be marked confirmed or pending; "Pending transfers" list; close-day shows unconfirmed transfers. The "transfer that never arrived" is the shop's silent loss.

**Decisions:** `Sale.payments[]` transfer legs gain `confirmed: boolean` (default true at entry, owner can flip); a Pending list (Home card or Reports) shows unconfirmed transfers with "Confirm" / "Still missing"; close-day reports unconfirmed transfer value separately (never in drawer cash — they're bank, not drawer); no auto-matching to bank statements (v1 is owner-confirmed only).

**Verification:** a transfer leg marked pending appears in the list; confirming clears it; close-day totals exclude it from drawer cash.

## Q3. Accountant-ready export (P1)

**Objective:** Data & Backup gains a period pack: sales, purchases, expenses, credit movements, stock movements as clean CSVs — the accountant takes files, not screenshots.

**Decisions:** one "Export books" action with a period picker; five CSVs, header rows in plain names (date, item, qty, amount, method, customer, category); reuse the existing export infra; no live totals (raw movements — the accountant computes); works offline.

**Verification:** export a month → five CSVs open cleanly in Excel/Google Sheets; numbers match Reports by spot-check.

## Q4. Lost-sale capture — CUT → future-scope (engineer vet 2026-08-25)

**Objective:** when a product is out and a customer asks, record it: "Asked but out." Stockouts become demand data, not just losses.

**Engineer verdict:** demand data, not a v1 need — reorder points already use real sales history. Spec retained for the future queue (see future-scope.md §20).

**Decisions:** on a product's out-of-stock state (POS search + product page), one quiet action "Asked but out" (+ optional count); stored as a per-product counter with dates; reorder urgency uses it (a product asked-but-out ranks above a quiet one); Reports shows "Missed sales" count. One tap, never a modal wall.

**Verification:** mark 3 ask-outs on a product → reorder list ranks it first; the count shows on the product page.

## Q5. Supplier lead time + last price (P1)

**Objective:** supplier record gains lead time (days) and last purchase price; reorder point = lead-time demand + safety stock. The reorder math is only honest with the lead time.

**Decisions:** `suppliers` gains `leadTimeDays` (optional); reorder-point calculation (I1) uses it: reorder point = avg daily sales × lead time + safety buffer; last price auto-stored from the latest purchase; shown on the supplier detail (contacts hub ties in).

**Verification:** a 7-day lead-time supplier + 10/day sales → reorder point ≥ 70 + buffer; alert fires when stock crosses it.

## Q6. Void/refund with payment reversal (P1)

**Objective:** refund = void + payment-leg reversal, online-only (locked rule), ledger-correct — net revenue must match reality.

**Decisions:** sales detail's void action gains an explicit "Refund payments" step (reverses the payment legs: cash back out, transfer marked reversed, credit reversed against the customer's balance); writes reversal movements through the existing ledger path; online-only enforced (AGENTS.md locked rule); the P&L's "net of refunds" reads it directly.

**Verification:** void + refund a cash sale → drawer expected falls; refund a credit sale → customer balance rises; offline the action is blocked with the locked-rule message.

## Q7. Cash denomination counter (P1)

**Objective:** fast, error-free night counting: tap ₦1000 / ₦500 / ₦200 / ₦100 / ₦50 / ₦20 / coins → running counted total; variance vs expected at the end. The counting ritual, made quick.

**Decisions:** close-day gains a counting sheet: large steppers (tap to add one note of that denomination, long-press to add 5); running total + "Counted" vs "Expected" variance live; last-used denominations remembered per shop; zero extra steps to finish (counted total auto-fills the counted-cash field).

**Verification:** count 3 × ₦1000 + 5 × ₦500 → ₦5,500; variance shows vs expected; finishes in the close-day flow.

## Q8. Expense categories per business type (P1)

**Objective:** the chart of accounts, productized: fixed expense categories matching the business type (Rent, Salaries, Transport, Utilities, Stock losses, Misc + template extras); uncategorized expenses surface in books-health.

**Decisions:** `expenses` gain a `category` (fixed list from the business-type template; one "Misc" catch-all); category picker in the expense sheet (chips); books-health card counts uncategorized; Reports group expenses by category (the P&L's categorized expenses). Owner draws stay separate (financial audit §4).

**Verification:** add expenses in 3 categories → P&L groups them; an uncategorized expense appears in books-health until categorized.

## Q9. Cash runway indicator (P2)

**Objective:** inside the cash-flow report: "Cash covers X days of expenses" — the drawer's survival number.

**Decisions:** runway = (cash position) ÷ (average daily outflow over the period); one quiet line under "Cash position", plain language; zero if outflow is zero (never divide by zero — show "—").

**Verification:** seeded data shows a sane runway figure; no outflow → "—" not an error.

## F1. Cash-flow report (P1)

**Objective:** "Money in / Money out / Cash position" per period — the drawer's truth over weeks (profit is not survival).

**Decisions:** Reports tab, next to the P&L, same period filter; money in = cash + transfer + card sales + debt payments; money out = purchases + expenses + payouts; cash position = running balance from the ledger; drill-downs (tap a line → the underlying list); plain labels.

**Verification:** seeded data → correct in/out/position by hand-checked arithmetic; matches close-day history.

## F2. Product profit ranking (P1)

**Objective:** unit economics at shelf level: sell − weighted-average cost, ranked; the products that carry the shop.

**Decisions:** Reports → "Product profits": rank by margin ₦ and %; negative-margin products flagged (feed the alerts banner); uses the same WAC computation as the P&L; tap a product → its history.

**Verification:** a negative-margin product appears flagged; ranking matches hand-computed margins.

## R1. At-risk customers (P1)

**Objective:** customers who've gone quiet are churning — find them and win them back in one tap.

**Decisions:** Contacts hub gains an "At-risk" chip (no purchase in 30/60/90 days, from sales history); debtors who've also stopped buying flagged doubly (owe AND gone); win-back action = WhatsApp with shop-aware copy; reuses the WhatsApp builder + contacts detail sheet.

**Verification:** a customer with a 45-day gap appears at-risk; tap → win-back message opens; the flag clears after their next sale.

## R2. Repeat-customer rate (P2)

**Objective:** what share of this week's customers bought before? The base-building number.

**Decisions:** one Reports stat: returning vs new customers per period (from customer ids in sales history); a quiet line, no chart.

**Verification:** seeded mix → correct ratio.

## I1. Reorder points + days-of-cover (P1)

**Objective:** "3 days left" instead of "0 in stock" — per-product safety stock, honest low-stock alerts.

**Decisions:** product form gains `reorderPoint`; days-of-cover = stock ÷ avg daily sales (from the ledger, last 30 days); alerts banner shows the urgent ones ("Bags of rice: 3 days left"); reorder point = lead-time demand + safety buffer (uses Q5's lead time when set, else a 3-day default).

**Verification:** a product at 2 days-of-cover fires the alert with the days figure; setting a reorder point suppresses noise below it.

## I2. ABC analysis (P1)

**Objective:** protect the ~20% of products that make ~80% of revenue; alerts prioritize A-items.

**Decisions:** Reports → ABC view (A = top movers by revenue share, B = steady, C = slow); computed from the ledger per period; alerts banner marks A-item shortages as urgent; stock-count default sort = A first.

**Verification:** seeded data produces a sane A/B/C split; an A-item shortage alerts before a C-item.

## I3. Demand-variability buffers (P2)

**Objective:** erratic movers need deeper safety stock (the XYZ principle, v1 note only).

**Decisions:** products with high sales variance get a higher default reorder buffer (×1.5); computed from daily sales history; no new UI beyond the reorder-point field.

**Verification:** an erratic mover's suggested buffer is visibly higher than a steady one's.

---

## Cross-feature rules (all quick wins)

- Every feature passes the perf doctrine (§2.7): local compute or static assets, no network on the critical path, ≤5MB.
- Every screen/sheet keeps one primary button, chips for single-choice, plain copy, AA tokens.
- Every migration (source field, returnable fields, wholesale price) is ask-first and defaults to non-breaking.
- Nothing here creates a new bottom-nav tab or a dead end.
