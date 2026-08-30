# StockPadi — The Definitive Master Plan (consolidated, vetted, minimal)

*One document. All research folded in and vetted. Every feature judged: KEEP / REJECT / REMOVE. Every competitor button and arrangement noted, then amplified through a Google Photos / Google Drive / Metro minimalism lens. Compiled 2026-08-25. Supersedes the loose 58-item audit; research evidence docs remain in `docs/` for citation.*

---

## 1. What we are (the vetting filter — every feature is judged against this)

> **An offline-first POS, inventory and credit ledger for 1–6 branch Nigerian ,lower and midscale informal retailers and entrepreneurs. Free at the core. It answers one nightly question: what did I sell, what's in the drawer, who owes me. It never corrupts stock, and the owner can export everything any time.**

If a feature does not serve that sentence, it is rejected. If a feature serves it but adds buttons, it is made invisible until needed.

## 2. The minimalism doctrine (Google Photos / Google Drive / Metro)

Borrowed from products that ship less: one primary action per screen, flat minimal buttons (icon + label, no decoration), generous whitespace, progressive disclosure, search-first instead of menu-first. Concretely, for every screen:

1. **One primary button.** Everything else is a ghost/secondary action or hidden in a sheet. If a screen shows two solid buttons, one of them is wrong.
2. **Buttons are flat and quiet** — tonal fill only for the one action, outline/text for everything else. No gradients, no glow, no 3D. (Google Drive's toolbar is a row of flat icons; ours is a row of flat icons.)
3. **Chrome disappears.** Bottom nav carries at most 4–5 icons. Headers are one line. No badges that shout; a quiet dot or count.
4. **Search-first.** The POS and product screens ARE a search box first (Drive's pattern) — type to find, tap to act.
5. **Progressive disclosure.** Advanced fields live behind "More" in a sheet (FigoBooks's accordion pattern). The first screen of a form shows 3 fields, not 15.
6. **Whitespace is a feature.** Cards breathe; focus blocks (One UI) pull the eye to the one number that matters (the sale total, the drawer variance, the top debtor).
7. **Motion = state only.** Fade/translate for appear/dismiss, ripple for press, nothing else. `prefers-reduced-motion` kills it all.
8. **Metro's grid honesty:** a screen is a grid of tappable cells with real labels, never a wall of ambiguous icons.

The design tokens in `tokens.css` already enforce most of this; the doctrine above is the review lens for every new screen (fold into the 12-point checklist in `zero-ai-slop-design.md` §6).

## 2.5 The activation model (why Tracepos asks questions — and what we do instead)

**The screens revealed the reason.** Tracepos's 14 questions (team size, revenue, industry, current inventory system…) are not for the user's benefit — they are a **lead-qualification funnel**: when an answer matches their spec, Tracepos's team contacts you and starts onboarding *manually*. The questions are the trigger for a human sales process. That is the entire point of their questionnaire.

**StockPadi's model is the opposite: automatic, gated by activation.**

1. **Ask a few questions** — business name, business type, phone (the activation contact), state. That's it. Not team size, not revenue: we are not qualifying leads to sell to them; we are vetting who gets in.
2. **Activate through the admin panel.** The answers land in an operator-side queue (pending). The operator taps **Activate** (or Reject); the shop owner gets a "your shop is live" notification. Controlled access: the app is never saturated with unvetted signups.
3. **Everything after activation is automatic.** First product → airplane-mode sale → dashboard. No manual onboarding team, no calls, no sales process. The few questions gate entry; the software does the rest.

**Feature to build (P1): Admin activation queue.** An operator screen listing pending signups (name, business type, phone, state, time) with Activate / Reject; activation sends the shop-live notification and unlocks the onboarding walk. Pending accounts see only an "awaiting activation" screen — never a dead end, never the full app.

## 2.6 Structure (how everything is arranged)

- **The flow:** Signup (4 questions) → Pending (activation screen) → Activated → First product → Airplane-mode sale → Dashboard. Every step has Skip/Back — no dead ends.
- **Navigation:** 5-tab bottom nav, **M3-standard component kept as-is** (role-filtered, prefetched, quiet AlertBadge) but re-mapped: **Home** (command center: quick-action cards New sale / Add product / Close day / New credit, debtor card, alerts banner, low stock) · **Sell** (the money screen, thumb-reach slot 2) · **Inventory** (was "Products" — unified stock hub: products, purchases, stock count, low-stock filter, import/export) · **Reports** (sales, close day with "Close today", P&L, expenses, aging debtors) · **Settings** (grouped rows, unchanged). WORKER sees Sell + Inventory only. Everything else lives behind Home cards or Settings rows — never a menu wall, never a drawer (drawers hide tools = the opposite of fast access).
- **Global search (the real "fastest access" answer):** a Drive/Photos-style search field at the top of Home — type a word → products (tap = open or add to cart), customers (tap = view credit), screens (tap = jump). One field, every tool, ≤2 taps.
- **Feature linking (unclutter by connecting):** Home cards jump INTO flows ("Who owes you" → credit → WhatsApp remind; "2 items low" → filtered inventory; "Close day" → the ritual). Every Report number taps into its list (no dead-end stats). Product page → "Count stock" and "Add purchase" prefill that product. Sale detail → Reprint / Remind / Repeat. Nothing requires Settings to do a daily task.
- **Forms:** bottom sheets, 3 visible fields max, the rest behind "More". Single-choice is **chips** (business type, payment method), never dropdowns. In-screen **segmented controls** (FigoBooks's App/Scan/Printer habit) for modes, not nav.
- **Buttons:** one emerald primary per screen; ghost Back top-left, text Skip top-right. Never Tracepos's "Back + Next Step" wall.
- **Screens (M3 taste):** tonal focus block at top (illustration + headline + sub), content, one primary at the bottom third (One UI thumb reach). Quiet progress dots, no "Step X of Y" text.
- **The 3 trust screens** with exact copy and token mapping: `docs/onboarding-design-m3.md`.
- **Next research step:** LazyWeb MCP is now connected and verified healthy. Evidence note (2026-08-25): `lazyweb_search` "POS checkout bottom navigation" → moderate coverage, consumer-skewed (DoorDash/Uber/Amazon/Adidas) — consistent with the earlier R&P finding that LazyWeb's corpus lacks operator-POS screens. Confirmed patterns: bottom sheets for quick actions (Adidas/Gopuff checkout sheets), 5-tab bottom nav as the norm (Farfetch/Depop/Amazon), "Sell" as a tab (Depop), persistent summary bar (GrubHub). Per-screen `lazyweb_generate_report` runs are available when redesigning a specific screen (e.g. the Home hub) with a captured screenshot.

## 2.7 Performance & speed doctrine (the app must never feel slow)

1. **Modal-first.** Any single-purpose form becomes a **bottom sheet, not a page**: sheets are client-side components already in the JS bundle — zero route navigation, zero full-screen re-render, instant open. Convert to sheets: **Add product, Add expense, Add purchase, Add customer, Record payment, New staff, Close day, Settings edits** (business/branches/WhatsApp/help). Keep as pages only where a full screen earns it: POS, lists (inventory/sales/customers/staff), sales detail, reports, settings, stock count, onboarding.
2. **Search in strategic places only.** Three searches, all Dexie-local (zero network, zero preload cost): Home jump-search (products/customers/screens), POS product search (exists), Inventory filter (exists). **Never** on Reports/Settings/Sales/detail — the job there is acting and reading, not finding. Rule: search where the user's job is *finding*; never where the job is *acting*.
3. **Preloading discipline.** Prefetch only the 5 tabs (BottomNav already does). Modals add no prefetch by design. Heavy routes (Reports charting) lazy-load via `dynamic()` on first visit. No analytics/network scripts in the critical path. Token SVGs only — no raster. Every data read is Dexie-local: the app never waits on the network to render a screen.
4. **Budget gate (PRD §8: 5MB install, 3s cold start on 2G).** Every feature below is local-first. Anything needing a new network dependency, a heavy library, or a backend round-trip on the critical path is rejected or future-scoped. If a feature can't prove it stays under the budget, it doesn't ship.

---

## 3. VETTED — keep (already built; the product is genuinely lean — nothing egregious to cut)

| Area | What | Why it stays (source) |
| --- | --- | --- |
| Ledger | Append-only `stock_movements` + `customer_credit_movements`, no mutable stock, two-device conflict tests | THE moat; nobody in the field has it (R&P §3, verified in code) |
| POS | Checkout with split payments (Cash/Transfer/Card/Part/Unpaid), cart, search-first browse | The money screen; split payment = most-endorsed complaint solved (R&P §1.1-A) |
| Inventory | Products, categories, barcode scan + print, stock count, CSV import/export | Bulk onboarding + the stock-mismatch trust fix (R&P §1.1-C) |
| Credit | Full debtor ledger, balances from movements, printable statements | The retention hook (R&P §4.3) |
| Staff | RBAC roles, branch scope, audit log | The PAID feature — review evidence: owners pay for staff logins (R&P §1.1-F) |
| Close Day | Reconciliation with counted-vs-expected variance + history | The nightly ritual; the wedge vs POS terminals (R&P §2) |
| Reports | Daily/weekly/monthly, per-branch/consolidated, best/worst sellers | Core value |
| Ops | Expenses, purchases, suppliers, branches | Needed for a real profit number (R&P Phase 3) |
| Settings | Business, Branches, Sharing (WhatsApp), Data & Backup (export), Help, About | Export = the trust promise; restructured already (audit) |
| Sales history | List + detail with reprint/void (online-only) | R&P Phase 1 #12, built |
| Auth | Supabase email verification, out-of-band worker passwords, RBAC enforcement (UI + Dexie + RLS) | Shipped `3e5fc88`; security-correct |
| Sync | SyncIndicator, offline banner, outbox | Offline trust (figobooks §D pattern) |

## 4. VETTED — build (each one minimal: one button, one card, one action)

| # | Feature | The minimal version | Why (source) | Pri |
| --- | --- | --- | --- | --- |
| 1 | **Units model** | Product gets "Sell as: piece / carton (×N)"; checkout shows a unit chip; ONE stock pool underneath | The most-endorsed functional complaint in the whole research set (tray/egg, bag/mudu) (R&P §1.1-D) | **P0** |
| 2 | **Growth & Trust Onboarding** | Minimalist 4-step walk blending Marketing (offline wedge), Sales (1-tap vertical templates + starter catalog), Education (micro-learning for offline till, WhatsApp debt recovery, nightly close). Live margin badge. | Kippa locked 500k merchants out; Bumpa is paid-only; Tracepos's 14 questions are a manual-sales funnel — ours converts with trust + instant value (`docs/improvements/02-growth-onboarding-experience.md`) | **P0** |
| 2b | **Admin activation queue** | Operator screen: pending signups (name, type, phone, state) with Activate / Reject; shop-live notification on activation; pending accounts see only the "awaiting activation" screen | The controlled-access model: not saturated with unvetted signups (§2.5) | P1 |
| 2c | **Nav re-map (no new component)** | Keep BottomNav; relabel Products→Inventory, Dashboard→Home; Home becomes the command center; WORKER role stays Sell+Inventory only | M3 max 5 destinations; the component is already correct — the map was the problem (§2.6) | P1 |
| 2d | **Strategic search (not everywhere)** | Home jump-search + POS search (exists) + Inventory filter (exists) — all Dexie-local, no network. Explicitly NOT on Reports/Settings/Sales | Drive/Photos search-first, but only where the job is *finding* — never where it's *acting*; zero preload cost (§2.7) | P1 |
| 2e | **Hub dashboard + feature linking** | Home = quick-action cards (New sale, Add product, Close day, New credit) + debtor card + alerts + low stock; every report number drills into its list; product→count/purchase prefills; sale→reprint/remind | No-dead-ends complaint (R&P §1.1-I); "link features so no screen requires Settings for a daily task" (§2.6) | P1 |
| 2f | **Stock-count compact list (redesign existing page)** | Enter the page → one-line rows: name · current stock · unit (like the products list, NOT expanded forms). Chevron expands an inline form for THAT product only (counted qty, reason, note, Save). Only expanded rows render forms → faster loading + uncluttered | User's flow idea; fits modal-first/perf doctrine (§2.7); existing page renders one product at a time into a form | P1 |
| 2g | **Unsaved edits persist + confirm modals (vital actions only)** | Collapsing an edited row KEEPS the edits until Save changes (useDraft already persists — keep per-row drafts). Leaving a screen with unsaved edits → confirm sheet "Discard changes?" (Discard / Keep editing). Scoped to discard/destructive only — never on Save, never on routine nav | Prevents silent data loss; the user's flow idea; matches "confirmation where necessary" (§2.7) | P1 |
| 2h | **Brand icon + link-share preview (marketing quick-win)** | Replace the Vercel-default share preview: brand favicon set (icon.svg mark + apple-touch-icon 180×180 + OG image 1200×630) so every shared link (receipt, reminder, store page) shows the StockPadi mark | Every share is a product impression (R&P §6); tiny, zero perf cost | P1 |
| 2i | **Role-based screen sets + landing** | Cashier lands on **Sell**; owner/admin lands on **Home**. Formalize per-role sets (WORKER: Sell, Inventory, own Profile; OWNER/ADMIN: everything + management). Route guards + nav filter already exist — this adds role landing + clarity | "One set of screens per role" — uncluttered by role, not just by design (R&P §1.1-F) | P1 |
| 2j | **Contacts hub (Settings)** | ONE section: search + type filter chips (All / Customers / Debtors / Suppliers) with count badges; unified list (customers with credit balances, suppliers from purchases, debtors sorted by amount owed); **FAB at the bottom** to save a new number (name + number + type) | Every relationship in one place; retention (debtor book) + linking doctrine (§2.6) | P1 |
| 2k | **First-visit walkthrough (per-page coach marks)** | On first visit to a page, highlight 2–4 key elements with a one-line function label **above or below** the element (user's exact ask). Dismissible (X), quiet progress dots, seen-flag per page in localStorage, re-triggerable from Help ("Show me around"). `prefers-reduced-motion` → static outline, no pulse. Keep the 8-step GuidedTour for first-run | LazyWeb-verified pattern (strong coverage 0.636: Character AI tooltip modal, DuckDuckGo 2/4 tour, Four Seasons overlay, Google Maps contextual tip); pure client-side, zero network | P1 |
| 3 | **"Who owes you" card** | ONE card on the dashboard: top 3 debtors + total; ONE action per row: WhatsApp remind | The debtor book is the retention hook (R&P §4.3; figobooks §A) | P1 |
| 5 | **Wholesale pricing** | Product gets a wholesale price; checkout gets a Retail/Wholesale toggle chip | Half of the units complaint — "sell as retail or wholesale from one pool" (R&P §1.1-D); Prokip ships it | P1 |
| 6 | **Ledger → P&L + balance sheet** | One report: profit, per period, from the ledger. Non-accountant language | SimpleBks's core, trivially ours (study §1; playbook Tier 1) | P1 |
| 7 | **Alerts banner (absorbs books-health)** | ONE quiet banner on Home: "2 items low · 3 missing cost price · 1 day unclosed · 2 uncategorized expenses · review" — tap = filtered list | Low-stock + integrity + the hygiene counts from the accountant's weekly routine (financial audit §8), merged into one banner | P1 |
| 8 | **Accent themes + dark mode** | Settings picker, 4–5 accent colors + dark toggle; theme pre-render already exists | FigoBooks's delight feature, cheap on our tokens (figobooks §8) | P1 |
| 9 | **Credit recovery** | On each credit sale: ONE "Remind" button → WhatsApp/SMS with balance | Turns our credit ledger into the retention engine (R&P §4.4) | P1 |
| 10 | **Returnable assets** | Product type "returnable" + deposit field; sale records deposit; returns screen deducts. Deposits = liabilities (never revenue) | Tracepos's differentiator — but a vertical need (beverage/gas/water), not core; engineer-vetted to P2 | P2 |
| 11 | **PIN lock** | Settings toggle; 4-digit PIN to open the till; PIN pad bottom sheet | FigoBooks screenshot-verified; shared-device reality (figobooks-ui §E) | P1 |
| 12 | **Receipt/label customizer** | Settings → Print: pick fields (Name/Price/Stock/Barcode) + 2–3 layout cards, print A4/thermal | FigoBooks's label customizer (figobooks-ui §F) | P2 |
| 13 | **Sync queue detail** | Data & Backup shows pending/failed/total + last sync time (numbers, not jargon) | FigoBooks reassurance pattern (figobooks-ui §D) | P1 |
| 14 | **Aging debtors** | Reports → one 30/60/90 table | Nobody has it (figobooks §8) | P2 |
| 15 | **Bill-payment commissions** | One settings toggle + one ledger movement type; needs an aggregator partner | Tracepos revenue pattern (tracepos-deep) | P2 |
| 16 | **Web Bluetooth thermal printing** | Settings → Print → "Pair 58mm printer" (navigator.bluetooth) | Beats FigoBooks's companion app (figobooks §8) | P2 |
| 17 | **Multi-currency** | Config value only, no UI work (already config-driven) | Bumpa paywalls it at Growth+; ours is free (bumpa-deep §7) | P2 |

## 4.5 Build method — the technical vetting (sheet / page / future)

Every vetted feature classified by how it's built, judged on one axis: **does it keep the app fast (Dexie-local, no network on the critical path, ≤5MB)?**

| Method | Features | Why |
| --- | --- | --- |
| **Bottom sheet (modal)** | Add product · Add expense · Add purchase · Add customer · Record payment · New staff · Close day · Settings edits (business/branches/WhatsApp/help) · source-tag chip · wholesale toggle · credit-payment picker · **unsaved-changes confirm sheet** | Already in the JS bundle → zero route load, zero re-render, instant. The default for any single-purpose form (§2.7.1) |
| **Page** | POS · Inventory · Sales history + detail · Reports · Settings · Staff list · Customers · **Stock count (compact list + inline expandable form, §4-2f)** · Onboarding (3 screens) | Full screens that earn the navigation: high-frequency destinations, guided flows, or share targets |
| **Local-first fast** (Dexie compute, no network) | Units model · debtor card + aging · alerts banner · PIN lock · themes · WhatsApp/SMS links (`wa.me`) · P&L from ledger · returnable assets · receipt/label print (browser) · **per-page coach marks (§4-2k)** · **contacts hub (§4-2j)** · **brand icon + OG image (static assets, §4-2h)** | All pure local computation or static files — zero budget impact |
| **FUTURE SCOPE** (network/backend/heavy — not now) | Admin activation queue (needs backend endpoint + operator UI) · bill-payment commissions (aggregator + backend) · multi-currency rates (backend/API) · Web Bluetooth printing (device APIs) · per-screen LazyWeb report redesigns | Each adds a network dependency or heavy surface — gated by §2.7.4 until it can prove budget + speed |

**Search placement (final):** Home jump-search, POS search, Inventory filter — three Dexie-local fields, nowhere else (§2.7.2).

## 4.6 Financial correctness (accountant-reviewed — nothing missed in the math)

Reviewed 2026-08-25 with the installed `accounting` skill (whawkinsiv/solo-founder-skills, MIT) and `finance-billing-ops` (affaan-m/ecc, MIT) — both license-verified. Full detail + grades: `docs/research/financial-expert-audit.md`.

| Fix | What | Lands in | Pri |
|---|---|---|---|
| **Weighted-average COGS** | One `costPrice` field misstates profit whenever purchase prices change (10 bags at ₦100k, 10 at ₦120k → all sales value at ₦120k). Compute running WAC from `stock_movements` at sale time; zero stored balances | P&L spec (quick-wins §6) | P0 (with P&L) |
| **Close-day cash equation** | expected = opening float + cash received (per method) − cash expenses − payouts; variance = counted − expected. The most-endorsed review asks for per-method end-of-day totals — the equation delivers them | close-day | P0 |
| **Deposits = liabilities** | Returnable-asset deposits are NOT revenue (owed back on return); sale revenue = goods only, deposit = liability line | returnable assets (quick-wins §10) | P1 |
| **Owner draws ≠ expenses** | Money the owner takes from the till is a draw → equity, never operating expenses, or profit is a lie | close-day + expenses | P1 |
| **P&L shape + Balance Sheet** | revenue (net) − WAC COGS = gross; − categorized expenses = net. Balance sheet: assets (cash + receivables + inventory at WAC) − liabilities (payables + deposits + VAT) = equity. Both derive from the ledger; the banker's report | P&L spec (quick-wins §6) | P1 |
| **VAT = liability rule** | If the future VAT toggle ships: VAT collected is owed to FIRS, never revenue; excluded from P&L | future-scope | P2 |
| **Books-health → merged into the alerts banner** | the accountant's weekly routine counts (unclosed days, missing cost prices, uncategorized expenses) became the banner's items — one surface, not a second card (engineer-vetted merge) | alerts banner (row 7) | — |

## 4.7 Business-manager + inventory-manager review (three professional lenses)

Reviewed 2026-08-25 with the installed `finances`, `retention`, and `inventory-demand-planning` skills (all license-verified). Full detail + grades: `docs/research/business-manager-audit.md`.

| Fix | What | Pri |
|---|---|---|
| **Cash-flow report** | "Money in / Money out / Cash position" per period — profit is not survival; the drawer's truth over weeks | P1 |
| **Product profit ranking** | ranked sell − WAC margins; negative-margin warnings feed the alerts banner | P1 |
| **At-risk customers** | Contacts → "At-risk" chip (no purchase in 30/60/90d) + win-back WhatsApp; debtors who've stopped buying flagged doubly | P1 |
| **Reorder points + days-of-cover** | per-product safety stock; "3 days left" instead of "0 in stock"; honest low-stock alerts | P1 |
| **ABC analysis** | Reports → A/B/C product classes; alerts prioritize the ~20% that make ~80% of revenue (engineer-vetted: analysis depth — needed only after reorder points land) | P2 |
| Repeat-customer rate | one Reports stat: returning vs new | P2 |
| Demand-variability buffers | erratic movers get a higher default reorder buffer (note only in v1) | P2 |

## 4.8 Gap review — the skills pass 2 (features we had NOT added)

Re-audited 2026-08-25 against the full professional stack (`accounting`, `finances`, `retention`, `inventory-demand-planning`, `finance-billing-ops`) for anything not yet in the plan. Nine gaps found and added; each maps to a compact spec in `docs/specs/quick-wins.md` (sections Q1–Q9).

| # | Feature | Minimal version | Lens (why) | Pri |
|---|---|---|---|---|
| Q1 | **Expense receipt capture** | attach a photo to an expense (local blob, offline); view anytime | accounting — "save digital receipts for every expense" | P1 |
| Q2 | **Transfer confirmation** | transfer payment legs get confirmed/pending; "Pending transfers" list; close-day shows unconfirmed | accounting/finance-billing-ops — "the transfer that never arrived" is the shop's silent loss | P1 |
| Q3 | **Accountant-ready export** | period pack from Data & Backup: sales, purchases, expenses, credit, stock movements as clean CSVs | accounting — the accountant takes files, not screenshots | P1 |
| Q4 | **Lost-sale capture** | "Asked but out" on a product → demand signal + reorder urgency — **engineer-vetted: demoted to future-scope** (demand data, not needed for v1; reorder points use sales history) | inventory-demand-planning | future |
| Q5 | **Supplier lead time + last price** | on the supplier record; reorder point = lead-time demand + safety stock | inventory-demand-planning — the reorder math needs the lead time | P1 |
| Q6 | **Void/refund with payment reversal** | refund = void + payment-leg reversal, online-only (locked rule), ledger-correct | finance-billing-ops — net revenue must match reality | P1 |
| Q7 | **Cash denomination counter** | night counting: tap ₦1000/₦500/₦200/₦100/₦50/₦20/coins → counted total vs expected | accounting — the counting ritual, made fast and error-free | P1 |
| Q8 | **Expense categories per business type** | chart of accounts: Rent, Salaries, Transport, Utilities, Stock losses, Misc; uncategorized → books-health | accounting — the chart of accounts, productized | P1 |
| Q9 | **Cash runway indicator** | "Cash covers X days of expenses" inside the cash-flow report | finances — "cash flow is reality" | P2 |

## 4.9 Engineer vet — features cut or demoted (2026-08-25)

Every researched feature was re-vetted against the product sentence (offline-first POS + ledger for 1–6 branch retail, ≤5MB, no network on the critical path). Result: 5 cut or demoted, 1 merged, everything else stands.

| Feature | Was | Engineer verdict | Why |
|---|---|---|---|
| Order source tag (row 4) | P1 | **Cut → future-scope** | Bumpa's e-commerce channel model; a shop-floor POS selling walk-ins doesn't need a channel report. Adds a field to every sale for a question nobody asked |
| Quick-scan multi-scan upgrade (QS) | P1 | **Cut → future-scope** | Barcode scanning was already demoted (most stock unbarcoded); the multi-scan drawer is polish on a minority path |
| Lost-sale capture (Q4) | P1 | **Cut → future-scope** | Demand data, not a v1 need; reorder points already use real sales history |
| Returnable assets (row 10) | P1 | **Demoted → P2** | A vertical differentiator (beverage/gas/water), not core; the accountant's liability treatment stays in the spec |
| ABC analysis (I2) | P1 | **Demoted → P2** | Analysis depth; reorder points + days-of-cover are the needed part, ABC is the polish on top |
| Books-health card | P1 | **Merged → alerts banner** | Duplicated the banner (low stock + missing cost already there); the hygiene counts (unclosed days, uncategorized) became banner items — one surface |

**Kept, after the vet (each earned its place):** units, activation onboarding + admin queue, nav re-map, strategic search, hub + linking, stock-count redesign, unsaved-changes guard, brand icon/OG, role screens, contacts hub, coach marks, who-owes-you, wholesale, P&L + balance sheet, alerts banner, themes, credit recovery, PIN lock, sync queue, WAC COGS, close-day equation, deposits-as-liability, owner draws, VAT rule, cash-flow report, product profits, at-risk customers, reorder points, transfer confirmation, accountant export, supplier lead time, void/refund reversal, denomination counter, expense categories, runway.

## 5. VETTED — REJECT (researched but NOT worth adding; each with the reason)

| Rejected | From | Why it's rejected |
| --- | --- | --- |
| Payment processing (Bumpa Wallet/Terminal, Tracepos gateways) | Bumpa, Tracepos | Locked boundary: payment-as-tag, no PCI liability (`payment-and-pci-scope.md`). The terminal wins payments; we win the night. |
| E-commerce website builder, shipping, delivery timeline | Bumpa | Wrong shape: shop-floor POS, not social-commerce. Building it makes us Bumpa-with-less. |
| Blog, gift cards, coupons, abandoned-cart recovery, sales countdown, product reviews on website | Bumpa | E-commerce chrome that adds buttons to a till. Rejected by the minimalism doctrine. |
| AI copilot | Tracepos | The ledger already answers "what did I sell, who owes me." An AI chat adds noise, not answers. WATCH only. |
| Loyalty points, three-way match | SimpleBks, PRD-deferred | Already deferred; keep deferred. A points system is a marketing feature, not a ledger feature. |
| Hardware printer bundle (₦55k) | FigoBooks | Valid GTM for them; we'd rather ship Web Bluetooth (feature 16) than inventory hardware. WATCH. |
| "AI agent for MSMEs" positioning | FigoBooks/Thrive Media | Positioning, not product. Reject the marketing, keep the receipts. |
| Per-product-tier pricing (free 5 products) | Tracepos | One price, unlimited users/locations. Tier-by-catalog-size is the anti-pattern we beat. |
| Full M3 dynamic color / multi-hue theming | M3 spec | One brand accent is the product. 5 accent themes max (feature 8). |
| Legacy browser polyfills | FigoBooks | WATCH only — add if Android 8 WebView actually breaks. |

## 6. VETTED — REMOVE or simplify (currently in the product, not worth keeping as-is)

| Item | Current | Action |
| --- | --- | --- |
| GuidedTour titles with emoji (🎉📦🧾) | Ban-list hit (zero-ai-slop §1) | Replace emoji with real lucide icons; titles become plain sentences |
| Barcode scanning as an onboarding/headline feature | Most stock is unbarcoded (R&P §4.1) | Keep as a checkout utility; never a permission prompt at signup |
| Consolidated multi-branch dashboard for single-branch shops | Correct for 2+ branches | Already hidden at 1 branch — keep hidden; no more investment until branch 2 exists |
| Pinch-zoom disabled (`userScalable:false`) | WCAG 1.4.4 violation | Allow zoom; keep `touch-action: manipulation` on the POS surface |
| Geist font, latin-only subset | Nigerian diacritics (Ọ, ọ, ẹ, ṣ) render as tofu | Add `latin-ext` or move to system Roboto/Noto (lighter, correct) |
| Hardcoded `text-sm`, `h-8 w-8`, `max-h-40` on a few screens | Ban-list hit | Token-ize (cosmetic; not urgent) |
| "Step X of Y" labels | A promise without steps | Already gone; never reintroduce |

Honest note: the current product is lean. There is nothing large to cut — the removals above are polish and discipline, not surgery. The real "removal" work is the rejection list in §5, which keeps it lean as it grows.

## 7. Competitor buttons and arrangements — noted, then amplified (minimally)

| Pattern (from) | Their version | Our amplified, minimal version |
| --- | --- | --- |
| Bottom-sheet forms (FigoBooks) | Drawer with drag handle + X close | All create/edit forms are bottom sheets; 3 visible fields, rest behind "More" |
| Payment state chips (FigoBooks) | Paid / Part paid / Unpaid chips | Same chips in our checkout — already split-payment capable |
| Sale-saved actions (FigoBooks) | Print Receipt (outline) + New Sale (solid) | Exactly one solid button (New Sale), one outline (Print) — the minimal pair |
| Multi-scan scanner (FigoBooks) | Camera stays open; drawer shows added item; Scan More / Done | Same: the drawer never blocks the next scan; Done = commit to cart |
| Steppers (FigoBooks) | `[-] [value] [+]` large controls | Same steppers for quantity in cart + receiving |
| Sync queue stats (FigoBooks) | pending/failed/total in Settings | Same numbers in Data & Backup (feature 13) |
| Cost-price warning (FigoBooks) | Banner + "review" filter-jump | Same banner; tap = filtered product list |
| Source tagging (Bumpa) | Channel labels across their whole flow | ONE chip at checkout (feature 4); channel report |
| Total inventory value (Bumpa) | A stat | ONE dashboard card computed from the ledger (no drift) |
| SMS payment request (Bumpa) | Request payment for unpaid orders | ONE "Remind" button on credit sales (feature 9) |
| Retail/wholesale toggle (Prokip) | Global checkout toggle | Per-product wholesale price + ONE toggle chip (feature 5) |
| Returnable assets (Tracepos) | Crates/kegs/pallets + deposits | Deposit field on the product, returns from the ledger (feature 10) |
| WhatsApp support (InkeepX/Tracepos) | Chat links | ONE "Help" row that opens WhatsApp with business context pre-filled |
| Search-first chrome (Google Drive) | A search bar, not menus | POS and Products ARE a search box; flat icon toolbar (doctrine §2.4) |
| Minimal flat buttons (Google Photos/Drive, Metro) | Quiet chrome, one action per screen | The doctrine §2 — the review lens on every screen |

## 8. Sequence (what gets built, in order)

1. **P0:** Units model · Activation + trust onboarding (airplane-mode proof + export promise).
2. **P1:** Admin activation queue · nav re-map · strategic search · hub dashboard + linking · stock-count compact redesign · unsaved-changes confirm · brand icon/OG · role-based screens · contacts hub · coach-mark walkthrough · "Who owes you" card · source tag · wholesale toggle · ledger P&L · alerts banner · themes · credit recovery · returnable assets · PIN lock · sync queue.
3. **P2:** label customizer · aging debtors · bill payments · Web Bluetooth · multi-currency config.
4. **Never:** everything in §5.

Each item enters the normal gate (spec → plan → build → verify, per `company-os/`), with the minimalism doctrine + performance doctrine (§2.7) applied at spec time, not after.

## 9. Sources

All research is consolidated here and the evidence lives in `docs/research/`: `RESEARCH-AND-PLAN.md` (user complaints, Grade A Play Store reviews, Kippa story), `tracepos-deep-research.md`, `bumpa-deep-research.md`, `figobooks-research.md`, `figobooks-ui-ux-study.md`, `nigerian-pos-competitors-study.md`, `amplification-playbook.md`, `onboarding-design-m3.md`. Product rules: `.agents/rules/design-system.md`, `zero-ai-slop-design.md`. Product docs: `docs/PRD.md`, `docs/SCAFFOLD.md`. Fresh source audit of `frontend/src` (this session). LazyWeb evidence (2026-08-25): nav patterns (moderate, consumer-skewed — sheets + 5-tab confirmed) and coach-mark walkthrough patterns (strong coverage 0.636 — Character AI, DuckDuckGo, Four Seasons, Google Maps). Unverified items (competitor offline depth, 1–3★ review text, FigoBooks screenshots 20–38) stay flagged in those docs; nothing here repeats them as fact. The superseded `research-vetting-report.md` was removed — its grades are folded into this document.

*The product, held to one sentence, one primary button per screen, one ledger that cannot lie. Everything else is either already built, already rejected, or waiting behind a sheet.*
