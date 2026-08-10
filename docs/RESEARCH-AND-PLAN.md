# Research, Audit & Build Plan

Status: proposal for Olaflay's approval. Nothing here is locked. Written 2026-08-07.

This document does three things: (1) reports what real users of competing apps actually complain about, with sources; (2) audits what this codebase currently is, against that evidence and against its own rules; (3) proposes a sequenced plan. Section 8 lists the decisions I could not make for you.

---

## 0. Research method and its limits — read this first

You asked for Reddit, LinkedIn, Instagram, Facebook and WhatsApp. Here is exactly what I could and could not reach, so you can judge the weight of everything below:

| Source | Result |
|---|---|
| Google Play reviews (Bumpa, Loyverse POS, Zobaze POS) | **Reached. Read directly.** This is the backbone of the evidence below — real review text, real names, real "N people found this helpful" counts. |
| Trade/tech press (TechCabal, Techpoint, Legit.ng, WeeTracker, Launch Base Africa) | Reached via search summaries. |
| Vendor pricing pages and comparison blogs (Moniepoint vs Opay terminal prices) | Reached. |
| **Reddit** | **Blocked.** `reddit.com` is not accessible to this agent — both direct fetch and search filtering are refused at the network/policy layer. I could not read a single Reddit thread. |
| **Trustpilot** | **Blocked.** HTTP 403. |
| **Nairaland** | **Blocked.** HTTP 403. |
| **LinkedIn, Instagram, Facebook, WhatsApp** | Not reachable — all require authenticated sessions this agent does not have. |

I did not invent quotes to fill those gaps. Where a claim below has no citation, it is my inference and is labelled as such.

**One free thing worth doing that I cannot do for you:** the highest-value remaining research is 1-star and 2-star Play Store reviews filtered by country, for Moniebook, Bumpa POS, and Zobaze, plus five conversations with actual shop owners you can reach. That is 3 hours of your time and it will beat any amount of further desk research.

**Update — Apify scraping added mid-session.** An Apify MCP connector became available and was used to search Facebook, X/Twitter, LinkedIn, and Instagram directly (not just Google's index of them) for Nigerian shop-owner complaints. Result: real user complaints on these platforms live inside private groups, closed communities, and DMs — none of that is publicly crawlable, with or without a scraping tool. What surfaced instead was brand accounts (Moniepoint, Paystack, Monnify posting their own marketing) and competitor marketing posts. The one useful yield: a cluster of direct competitors explicitly targeting this niche that hadn't surfaced before — **Kounta, SaleTick, Puzzle, and Timart**, all pitching inventory/sales tracking at Nigerian small businesses — worth a competitive scan before Phase 4. One line worth keeping from a SaleTick marketing post, since it names the wedge cleanly: *"Most small businesses in Nigeria are not struggling because of lack of effort. They're struggling because they're operating blind."* Reddit remained effectively unreadable even through the scraper — pages returned a bot-wall placeholder rather than content, confirming the earlier direct-fetch block wasn't a fluke.

---

## 1. What users actually complain about

Sorted by how often it appeared and how solvable it is. Each is quoted or paraphrased from a review I read.

### 1.1 Solvable, high-frequency, and directly relevant

**A. You cannot record one sale paid two ways.**
> "There should be room for 2 means of payment when recording a sale. A lot of customers at my store usually make payments with cash and card at once. I can't figure out a way to record this payment."
> — Benita Glory, Zobaze POS, Jan 2025. **58 people marked this helpful — the single most-endorsed review I found.**

Part-cash-part-transfer is normal in Nigeria. If the app can't record it, every downstream number is wrong, which poisons point B.

**B. The end-of-day cash-up is the real job, and apps get it wrong.**
Same reviewer, same review: *"I would like the Report section to be able to point out the exact amount collected for each available means of payment... at the End of Day."*

This is the ritual. Every shop owner counts cash at night and asks "does this match?" Nothing else in the app matters if this number is wrong.

**C. App stock does not match physical stock, and there is no way to fix it.**
> "there is a mismatch between actual physical stock and the app stock." — Isslam Azami, Zobaze, Jun 2026
> "after selling some items, instead of the number in the stock to reduce it keep increasing or giving any random number" — Zobaze, Dec 2019

Once the count is wrong and the vendor can't correct it in ten seconds, they stop trusting the app and go back to the notebook. Permanently.

**D. One product, sold in different units, from one stock pool.**
> "There should be an option to sell a single product as either wholesale or retail while using the same inventory stock. For example, if 10 trays of eggs are in stock, sales of individual eggs (retail) and whole trays (wholesale) should automatically deduct from the same inventory."
> — Cristoneil Barrientos, Zobaze, Jun 2026

Carton / pack / piece. Tray / egg. Bag / mudu / cup. This is how Nigerian retail actually works and almost no app models it.

**E. Naira amounts break the number handling.**
> "the digit is high; for instance, when the total amount of sales is 100,000. It would bring 1,000,000. So I need to edit it before sending the receipt to the customer." — adebayo ajalawilliams, Zobaze, Jul 2026
> "this app has maximum digits of 8 which means the maximum amount is 999,999.99. This is a limitation in countries where product prices exceed 1 million." — Imran Pandor, Loyverse, Jul 2026

Loyverse literally cannot represent a ₦1,000,000 transaction. That is a free win for anyone who gets it right.

**F. Staff logins with owner-set permissions is what converts free users to paid.**
> "I enjoy the free version very well but **I subscribe for the premium so that my staff can have their own login password from their device with roles I chose to set for them.**"
> — Aliyu Sani Aliyu, Zobaze, Jun 2026

This is direct evidence that the admin/roles feature you asked for is not a nice-to-have. It is the thing owners pay for. It is also why the current hardcoded-owner stub is the most expensive gap in the codebase.

**G. Setup is the wall. Catalog entry kills activation.**
> "At first it's a lot of work to input all of the items/modifiers/variants" — Loyverse, Dec 2019
> "Make it easy for us to record new order and new customers by add import contact directly from our phone." — KATE ONYEOMA, Bumpa, Jul 2026

If the first session requires typing 200 products, most vendors never reach session two.

**H. Native apps fail in ways a PWA does not.**
> "Bumpa app went missing on my phone immediately I opened it, I've tried several times to reinstall" — Joyce Adesanoye, Apr 2026
> "when I open it, it does not go to the main home page, it takes me to the Application's settings on my phone" — Michael Kanu, Mar 2026
> "it's giving me option to either uninstall or force close. pls do something about this. I'm using the pro version." — Doris Ahonye, Mar 2026

Three separate "the app won't open" complaints in one month on a 4.5-star app. This validates the PWA bet in the PRD.

**I. Navigation dead ends are noticed and resented.**
> "Only that I have to get used to tapping back on the app and not use the back button on my phone." — DrChibuki, Bumpa, Mar 2026

Confirms your "no dead ends" instinct with a real user's words.

**J. Signup friction, specifically OTP.**
> "the otp sent can not be copied back to the site sign up and there is no link from the email that one can use to get back to fill the otp sent. hope the site is ok" — alao tunde, Bumpa, Apr 2026

Note the last four words. Friction at signup does not read as friction. It reads as *"is this a scam?"*

**K. Support that answers on WhatsApp.**
> "the app is good but the customer support is poor (at the least). **No live chat, no WhatsApp contact**, slow response to mail." — Chidera Chike, Bumpa, Apr 2026

### 1.2 The trust story — the strongest asset you have

Kippa raised over $14M, reached ~500,000 merchants, then wound down. Since January 2024 users have been locked out of the app, *"leaving business owners without access to critical data like inventory, transactions, debtors, income, expenses, payments, and invoices."* ([TechCabal](https://techcabal.com/2024/02/23/kippa-users-left-in-the-dark/), [Launch Base Africa](https://launchbaseafrica.com/2025/08/18/founders-exit-website-down-the-unraveling-of-target-global-backed-kippa-that-raised-over-14m/))

Half a million Nigerian merchants learned, at the same time, that putting your books in someone's cloud means you can lose them. Separately, on Bumpa:

> "imagine if this people can declined me of 100naira I used to test the app what makes u think ur big money is safe with them." — Saka Kazeem, Apr 2026

**Your data lives on the vendor's phone first, and they can export the whole thing to a file whenever they want.** That is already true in this codebase (`src/lib/db.ts`, and the export/import in `src/app/(app)/settings/page.tsx`). It is currently buried at the bottom of a settings screen. It should be the loudest thing in onboarding.

### 1.3 Not solvable by this product — do not chase

Naira devaluation, POS terminal import costs, CBN's April 2026 one-principal-per-agent rule, bank settlement delays, network outages at the payment processor. Real pain, wrong product. Mentioning them in marketing is fine; building for them is not.

---

## 2. The weapon: why a vendor picks this over their POS terminal

The honest competitive picture:

| | POS terminal (Moniepoint / Opay / PalmPay) | Notebook + calculator | StockPadi |
|---|---|---|---|
| Cost to start | ₦15,500 – ₦50,000 upfront ([Truehost](https://truehost.com.ng/moniepoint-vs-opay-pos-pricing/), [Mintpoint](https://mintpoint.app/blog/how-much-opay-pos-machine)) | ~₦200 | ₦0, phone they own |
| Takes card payments | Yes | No | **No — and we should stop pretending otherwise** |
| Works with no network | Partly | Yes | Yes, fully |
| Tells you what you sold | Barely | If you wrote it down | Yes |
| Tells you who owes you | No | If you wrote it down | Should — see §4.3 |
| Your data if the company dies | Gone | Yours | **Yours, on your phone, exportable** |

The terminal wins on payments and always will — that is a locked boundary in `.agents/rules/payment-and-pci-scope.md` and it should stay locked. So do not fight it there.

**The wedge is the close of day.** POS terminals cannot tell a shop owner whether tonight's cash matches today's sales, because they only see the transfers that went through them. The notebook can't either, because addition is slow and error-prone. That is the gap.

The pitch is one sentence, and it should be the app's whole personality:

> **Every night, in thirty seconds, know exactly what you sold, what's in the drawer, and who still owes you.**

Not "inventory management." Nobody wants inventory management. They want the night to balance.

Second wedge, once they are in: **the debtor book.** Selling on credit is universal in Nigerian retail and the notebook is genuinely bad at it — it can't sort by who owes most, can't total, can't remind anyone. CreditBook and Kippa both built real traction on exactly this, and *"the app lets you contact debtors instantly via call, text, or WhatsApp."* This is the retention hook: a vendor with ₦180,000 owed to them across 22 customers, tracked in this app, cannot leave.

---

## 3. Codebase audit

I read every route and shared component. The scaffold is genuinely good — the ledger discipline in `src/lib/db.ts` and `src/features/inventory/stock.ts` is real and correctly enforced, and `src/features/inventory/__tests__/sync-conflicts.test.ts` is a real two-device test, not theatre. What follows is what is broken or missing, not a general verdict.

I ran the app and read the DOM. I could not capture screenshots — the browser pane would not composite frames in this environment — so the UI findings below are read from source and from the live accessibility tree, not from pictures.

### 3.1 Dead ends and navigation — confirmed, not theoretical

| # | Finding | Evidence |
|---|---|---|
| 1 | **`ScreenHeader` has no back button.** Every screen in the app shares one header component that renders a title and a sync dot. Nothing else. | [ScreenHeader.tsx](src/components/ui/ScreenHeader.tsx) |
| 2 | **`/onboarding` is a true dead end.** It sits outside the `(app)` route group, so it has no `BottomNav`, no back control, and no skip. The only exit is completing the form. | [onboarding/page.tsx](src/app/onboarding/page.tsx), [layout.tsx](src/app/(app)/layout.tsx) |
| 3 | **Onboarding says "Step 1 of 3". There is no step 2 or step 3.** The label is a promise the app does not keep — confirmed in the live DOM and in `docs/SCAFFOLD.md`. | [onboarding/page.tsx:~30](src/app/onboarding/page.tsx) |
| 4 | **There is no way to see a past sale.** No sales-history route exists. After `completeSale()` runs, a toast appears and the cart clears. The sale is unreachable forever. You asked about "the sold product card" — there is no such card anywhere in the app. | [complete-sale.ts](src/features/pos/complete-sale.ts), no route under `src/app/(app)/` |
| 5 | **There is no receipt.** PRD §7.2 lists "Receipts: on-screen, WhatsApp share, Bluetooth ESC/POS print" as MVP. None of it exists. | grep: no receipt UI |
| 6 | **No void/refund UI**, despite `Sale.voidedAt` existing in the type and the online-only rule being locked. | [types/sale.ts](src/types/sale.ts) |
| 7 | **`PermissionDenied` is a dead end for the role it blocks.** It explains which role is needed and offers no action, no link, nothing. A cashier who taps Settings is stuck on a wall. | [PermissionDenied.tsx](src/components/ui/PermissionDenied.tsx) |
| 8 | **There is no Profile screen and no logout.** Nowhere in the app. | grep: no matches |
| 9 | Dashboard's empty state routes to `/products` while POS's identical empty state routes to `/products/new`. Inconsistent. | [dashboard/page.tsx:~52](src/app/(app)/dashboard/page.tsx) |
| 10 | Product detail shows name, prices, category, barcode — **but not current stock**, the one number the whole ledger exists to produce, and offers no way to adjust it. | [products/[id]/page.tsx](src/app/(app)/products/[id]/page.tsx) |

### 3.2 Correctness bugs

**Credit sales create untraceable debt.** In [pos/page.tsx](src/app/(app)/pos/page.tsx), `handleCompleteSale` passes `customerId: null` — hardcoded. A cashier can select "Credit" as the payment method and complete the sale. The money is now owed by nobody. `customerCreditMovements` and `getCustomerCreditBalance()` both exist and are never written to or read from by any screen.

This is the worst bug in the codebase. It is not a missing feature; it is a flow that silently destroys financial data, in exactly the area (informal credit) where Nigerian retailers lose the most money. **Either wire it up or disable the Credit option until it is wired.**

**Single payment method per sale.** `PaymentMethod` is a scalar on `Sale`, and the POS uses a single `<select>`. This is finding §1.1-A, the most-endorsed complaint in the entire research set, and it is baked into the type. Fixing it is a schema change, so it should happen before there is production data.

**No unit model.** `Product` has `unitId: string | null` and nothing reads it. No conversion factor, no carton/piece. Finding §1.1-D.

**Currency formatting is not the reported bug, but check it.** `formatCurrency` uses `Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" })`, which is correct and has no digit ceiling — good, this avoids the Loyverse trap. But it emits two decimal places on every amount. Nigerian retail prices are whole naira; kobo has not meaningfully circulated in years. `₦1,500.00` reads as noise. Recommend `maximumFractionDigits: 0`.

### 3.3 Design-system violations

These are measured against your own `.agents/rules/design-system.md` and `zero-ai-slop-design.md`, not against my taste.

| Violation | Where | Rule broken |
|---|---|---|
| 🔒 emoji used as a status icon | [settings/page.tsx](src/app/(app)/settings/page.tsx), NDPR block | "No emoji standing in for real icons, especially for status" — explicit ban |
| **Cart quantity −/+ buttons are 32×32px** (`h-8 w-8`) | [pos/page.tsx](src/app/(app)/pos/page.tsx) | PRD §8 mandates 44×44 minimum. These are the highest-frequency touch targets in the entire app, used mid-transaction with a customer waiting. |
| Hardcoded sizes: `text-sm`, `text-lg`, `h-8 w-8`, `bottom-20 right-6`, `max-h-[30vh]`, `active:scale-98` | pos, reports, dashboard, products | "No hardcoded hex or pixel values in components, everything comes from a named token" |
| Product detail uses `animate-pulse` text "Loading product details…" instead of `<Skeleton>` | [products/[id]/page.tsx](src/app/(app)/products/[id]/page.tsx) | "skeleton, not a spinner, for anything over 300ms" |
| Product rows render as a non-interactive `<div>` for cashiers | [products/page.tsx](src/app/(app)/products/page.tsx) | Your instruction: every card tappable. A cashier should still be able to open a product to see stock and price. |

### 3.4 Lazyweb audit result — reported honestly

I ran Lazyweb searches for POS checkout patterns and for staff role/permission screens. Checkout returned strong coverage (0.59 similarity) but entirely consumer e-commerce carts — Amazon, eBay, Depop, Temu — which are the wrong shape: a shopper's cart optimizes for browsing and upsell, a cashier's cart optimizes for speed with a queue waiting. Roles/permissions returned **weak coverage (0.42, flagged by the tool itself)** and surfaced consumer profile screens, not operator permission matrices.

**Conclusion: Lazyweb's library does not cover this product category.** I am not going to dress up mismatched consumer references as a design audit. The useful reference set for this product is Zobaze POS, Loyverse POS and Moniebook screenshots on the Play Store, which you can pull manually.

---

## 4. What to build, what to cut

### 4.1 Cut or demote

| Thing | Why |
|---|---|
| "Step 1 of 3" label | Either build three steps or make it honest. Right now it is a lie the user catches in five seconds. |
| Barcode scanning as an MVP headline | PRD §7.2 lists camera scanning as MVP. Most goods in a Nigerian neighbourhood shop are unbarcoded — loose rice, sachet items, local goods — and the one review that mentions barcodes says *"the bar code sometimes getting mixed up."* Keep it, build it later, and never gate onboarding behind a camera permission prompt. An early permission dialog is a trust event, and you lose it. |
| Consolidated multi-branch dashboard, as a priority | Correct for the PRD's client. Irrelevant to a one-shop vendor and it should never appear when there is one branch. It already hides correctly — keep it that way and don't invest further until branch 2 is live. |
| Product variants, loyalty points, three-way match | Already deferred in the PRD. Keep them deferred. |

### 4.2 The admin / roles system you asked for

Locked to the PRD §14 permission matrix, extended to the per-permission control you described.

- **Owner is the final boss.** Owner and Admin can manage staff; nobody else can, ever, including offline.
- Owner adds staff: name, phone, role, branch, 4-digit PIN. **Up to 3 staff on top of the owner**, as you specified, enforced in code and surfaced as "2 of 3 used" rather than a silent failure at the limit.
- Role picks a preset from the PRD matrix. Then the owner can toggle individual permissions on top of the preset — "give this sales girl access to stock" is exactly that: a `stock.adjust` toggle on a Cashier.
- Every role change, PIN reset and permission toggle writes to `audit_logs`. Already in the schema, unused.
- **Permissions must be enforced in three places, not one:** the UI (`hasRole` / `hasPermission`), the local Dexie write path, and Postgres RLS. A cashier who edits IndexedDB in DevTools must still be rejected at the server. The RLS layer already exists in `supabase/migrations/20260807054734_rls_policies.sql`; the client-side half does not.
- `useCurrentUser` stays the single choke point. It becomes real; every screen keeps reading through it.

Evidence this is worth doing first: §1.1-F — a user upgraded to paid *specifically* for staff logins with owner-set roles.

### 4.3 The debtor book — the retention feature

- Credit sale → cashier must pick or create a customer. No `customerId: null` path for credit, ever.
- Customers list sorted by amount owed, descending. Total owed on top.
- Customer detail: what they bought, when, running balance, "Record payment."
- **"Remind on WhatsApp"** — opens WhatsApp to *that customer's* number with a pre-filled, polite message including the balance and the shop name.
- All of it computed from `customerCreditMovements` through `getCustomerCreditBalance()`. No stored balance field. The ledger rule already covers this.

### 4.4 WhatsApp, done properly

Today, `Share on WhatsApp` in [reports/page.tsx](src/app/(app)/reports/page.tsx) opens `https://wa.me/?text=...` with **no recipient** — it dumps the user into WhatsApp's contact picker every time. You asked for a number the owner sets once. Three distinct destinations, and they are not the same number:

| Share | Goes to | Set where |
|---|---|---|
| Close-day summary | **Owner's own WhatsApp number** — their nightly record, in their own chat | Settings → Business profile → "My WhatsApp number" |
| Sale receipt | The **customer's** number, from the customer record, or typed at the moment of sharing | Per sale |
| Debt reminder | That **customer's** number | Customer record |

Implementation is trivial and identical for all three: `https://wa.me/<E164 number>?text=<encoded>`. The work is the number storage, Nigerian number normalisation (`0803…` → `234803…`, handle `+234`, reject junk), and a `buildWhatsAppUrl()` helper so no screen hand-rolls the URL again.

### 4.5 Illustrations and motion — and one disagreement

You asked for AI-generated illustration images. I want to flag a conflict before building, then I will build to your call.

**The conflict:** PRD §8 sets initial install under 5MB and cold start under 3 seconds on 2G, on a 2GB-RAM Android 8 device. AI-generated raster illustrations are typically 150–600KB each even after compression, they do not land on your token palette, and they cannot recolour for dark mode. Six of them would consume most of your 5MB budget on decoration. That is the opposite of "won't be slow loading."

**What I recommend instead, to reach the same goal:** a small set of hand-authored SVG illustrations built directly from the M3 tonal roles already in `src/styles/tokens.css` — every shape references `var(--color-primary-container)`, `var(--color-tertiary)` and so on, so they recolour for free when the client's brand accent changes and in dark mode. Each one lands around 2–4KB, inlines into the component, and costs zero network requests. If you want AI in the loop, the sane use is generating *drafts* for a human to redraw as SVG — never shipping the raster.

Proposed set — six illustrations, each earning its place at a real emotional moment:
1. Welcome / trust (onboarding screen 1)
2. Works-without-network (the airplane-mode moment, PRD §18)
3. Empty catalog — "your shelf is empty"
4. Empty sales day — "no sales yet today"
5. Sale complete — the receipt moment
6. Close day balanced — the nightly reward

**Motion budget, strict:** CSS transforms and opacity only, never layout properties. Two durations from the existing motion scale. A `@media (prefers-reduced-motion: reduce)` block that kills all of it. Nothing animates on the POS screen during checkout — a cashier with a queue does not want delight, they want the button to have already worked. This is Meta's data-lite discipline from your own `design-system.md`, applied.

### 4.6 Onboarding — three screens, and the trust moment

The PRD already specifies the right thing in §18 (*"Guided 'try it in airplane mode' moment during onboarding, not just a marketing claim"*). It is the best idea in the PRD and it is not built. Build it.

1. **Welcome + trust.** Business name, business type. Says plainly: *this works with no network, your records stay on this phone, and you can export everything to a file any time.* Given what happened to half a million Kippa users, this is the most valuable sentence in the app.
2. **Your first product.** One product, three fields — name, what you paid, what you sell it for. Not fifteen fields. This is the activation moment and finding §1.1-G says catalog entry is where people quit.
3. **Prove it.** *"Turn on airplane mode and sell that product."* They complete a real sale with no network. Then the app shows the receipt and says: it's saved, it will sync when you're back online. Trust is now earned rather than claimed, and they have already used every core loop in the product.

Every screen has a visible **Skip**. Never a dead end.

---

## 5. Plan

Sequenced so each phase leaves the app shippable. Phases 0–2 do not depend on the tenancy decision in §8, so they can start immediately.

### Phase 0 — Stop the bleeding (small, do first)

1. Disable the Credit payment option until §4.3 lands, or wire the customer picker. Do not ship a flow that creates untraceable debt.
2. Back control in `ScreenHeader` for every non-tab route; `Skip`/`Exit` on onboarding.
3. Fix "Step 1 of 3".
4. Cart −/+ buttons to 44px minimum.
5. Replace the 🔒 emoji; move hardcoded Tailwind sizes onto tokens.
6. `PermissionDenied` gets an action — "Go to Dashboard" plus who to ask.
7. `formatCurrency` → `maximumFractionDigits: 0`.
8. Product rows tappable for every role.

### Phase 1 — The close-of-day weapon

9. **Split payment.** `Sale.paymentMethod` → `Sale.payments: { method, amount }[]`. Schema change, migration, POS UI that lets a cashier tap Cash ₦2,000 + Transfer ₦3,500. Do this before production data exists.
10. **Close Day, promoted.** It already exists inside Reports. Give it its own entry point, add expected-cash-in-drawer vs counted-cash with the variance shown, and mark the day closed.
11. **WhatsApp number config + `buildWhatsAppUrl()`** with Nigerian number normalisation (§4.4).
12. **Sales history + sale detail.** A list of today's sales, tappable, showing everything: items, quantities, payments, cashier, time, sync state. This is your "sold product card" — tappable, opening a full record. Detail view carries: share receipt on WhatsApp, reprint, and void (online only, per the locked rule).
13. **Receipt screen** after `completeSale`, with WhatsApp share.

### Phase 2 — Retention

14. **Real auth**: Supabase Auth for first login, cached salted PIN hash for daily use, per PRD §10.3. `useCurrentUser` becomes real.
15. **Users & roles admin** (§4.2): add up to 3 staff, role presets, per-permission toggles, audit log entries, enforcement in UI + Dexie + RLS.
16. **Profile screen**: who am I, my role, change my PIN, logout.
17. **Settings restructured** into a grouped list — Business, Staff & Access, Branches, Sharing (WhatsApp), Data & Backup, About — with Profile at the top. Every row tappable, every row leading somewhere.
18. **Debtor book** (§4.3), including WhatsApp reminders.
19. **Stock count / reconciliation**: pick a branch, count, enter counted quantity, app writes an adjustment movement with a mandatory reason. Fixes §1.1-C. Never edit a stock total — it goes through the ledger, per the locked rule.

### Phase 3 — Depth

20. **Units** (§1.1-D): carton/pack/piece with a conversion factor on the product, one stock pool underneath.
21. **Expenses** — the feature folder is a README only. Needed for the profit number to be real.
22. **Purchases / restocking** — same. *"it does not have a page to record purchases."*
23. Onboarding three-screen flow with the airplane-mode moment (§4.6).
24. Illustrations + motion (§4.5).
25. Expiry alerts for the Pharmacy template.
26. Barcode scanning, demoted to here.

### Phase 4 — Go-to-market

Only meaningful after §8 is decided.

---

## 6. Growth, from the marketing side

What the evidence actually supports, not general startup advice.

**Distribution.** The vendors are already in WhatsApp all day. Every share the app produces — receipt, debt reminder, close-day summary — should carry a small, non-obnoxious footer line naming the app. A receipt shared to a customer is a product impression on a person who is themselves often a small trader. This is the only channel here with real leverage, and it costs nothing.

**Positioning.** Not "inventory app." Nobody wakes up wanting inventory. Lead with the nightly balance and the debtor book: *know what you sold, and who owes you.*

**Pricing reality.** *"the average Nigerian doesn't want to pay for subscriptions... small business owners unwilling to pay monthly fees for a bookkeeping app when alternative solutions like physical notebooks are cheaper"* — one of the diagnoses of why Kippa struggled to monetise. But §1.1-F shows what people *do* pay for: staff logins with owner-set permissions. A one-person shop should never be asked to pay. The moment they hire someone, that is the moment.

**Trust, as the campaign.** Kippa's collapse locked half a million merchants out of their own records. Nothing in this market is a stronger message than: *your books are on your phone. Export them any time. If we disappear tomorrow, you still have everything.* Make it demonstrable in onboarding, not a claim on a landing page.

**Support on WhatsApp.** §1.1-K. For a single-client deployment this is nearly free and it is what "poor support" reviews are actually asking for.

---

## 7. Where this contradicts the PRD

You said contradictions are allowed. Flagging them anyway, per `AGENTS.md`, so they are decisions rather than drift.

| # | PRD says | This proposes | Why |
|---|---|---|---|
| 1 | §7.2 payment method is a single tag per sale | An array of payments per sale | The most-endorsed user complaint found. Schema change — cheapest now. |
| 2 | §7.2 barcode scanning is MVP | Demote to Phase 3 | Most stock is unbarcoded; an early camera prompt costs trust. |
| 3 | §7.2 Customers = "contact info and running credit balance" | Debtor book is a headline feature with WhatsApp reminders | Strongest retention hook in the market. |
| 4 | §7.2 Stock adjustments = "manual correction" | Add a guided full stock count | "app stock ≠ physical stock" is a recurring, trust-destroying failure. |
| 5 | §13 onboarding = three screens starting with business type | Three screens ending in a real offline sale | PRD §18 already asks for this; nobody built it. |
| 6 | Illustration implied as imagery | Token-driven SVG, no raster | §8's 5MB / 2G budget makes raster illustration self-defeating. |

---

## 8. Decisions I could not make for you

**8.1 — One client, or many vendors? This is the gate.**

`AGENTS.md` locks single-tenant: *"This is a single-tenant database. One `business_profile` row... No `business_id`-scoped multi-tenant RLS layer, that pattern belongs to a different product shape and must not be reintroduced."*

Your brief is written in the plural — "vendors," "get people to actually use this," "as a marketing agency." Those are not the same product. Multi-tenant means `business_id` on every table, a rewritten RLS layer, self-serve signup, and billing. It is a large, mostly-backend change, and doing it after there is production data is far more expensive than doing it before.

Phases 0–2 are identical either way, so this does not block starting. It blocks Phase 3 onward.

**8.2 — Three staff, hard cap or default?** You said up to three. Locked in code, or a configurable default per deployment? The latter costs nothing now and avoids a migration later.

**8.3 — The two "Limited" permissions** flagged in `supabase/migrations/20260807054734_rls_policies.sql` (Manager on expenses/audit-log, Inventory Staff on reports) are still explicit guesses. Building the roles admin makes them visible to users, so they need confirming.

**8.4 — Illustration approach.** §4.5. My recommendation is token-driven SVG. Your call.

---

## Sources

Play Store reviews read directly: [Bumpa](https://play.google.com/store/apps/details?id=com.salescabal.app), [Loyverse POS](https://play.google.com/store/apps/details?id=com.loyverse.sale), [Zobaze POS](https://play.google.com/store/apps/details?id=com.zobaze.pos).

[Kippa users left in the dark — TechCabal](https://techcabal.com/2024/02/23/kippa-users-left-in-the-dark/) · [The unraveling of Kippa — Launch Base Africa](https://launchbaseafrica.com/2025/08/18/founders-exit-website-down-the-unraveling-of-target-global-backed-kippa-that-raised-over-14m/) · [Moniepoint vs Opay POS pricing — Truehost](https://truehost.com.ng/moniepoint-vs-opay-pos-pricing/) · [Opay POS pricing — Mintpoint](https://mintpoint.app/blog/how-much-opay-pos-machine) · [POS prices double — Legit.ng](https://www.legit.ng/business-economy/industry/1676888-pos-prices-double-moniepoint-opay-palmpay-banks-raise-cost-terminals-fx-crunch/) · [Moniebook launch — Techpoint Africa](https://techpoint.africa/news/moniepoint-introduces-moniebook/) · [Moniebook's tricky first foray — WeeTracker](https://weetracker.com/2025/12/03/moniepoint-launches-moniebook-nigeria-bookkeeping-bet/) · [POS software vs paper records — SellsAdvantage](https://sellsadvantage.com/blog/pos-vs-manual-paper-records)
