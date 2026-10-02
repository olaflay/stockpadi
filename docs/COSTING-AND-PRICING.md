# Inventory Costing and Customer Pricing

Decision record for two questions that were open at launch:

1. **How is cost calculated?** (Promise 4 in `.agents/rules/trust-standard.md` — profit numbers are
   consistent.)
2. **What do we charge a shop?** (Business model, not a bug.)

Both answers below are researched, cited, and dated. Where the industry has no consensus, that is
stated rather than papered over.

Status: **decided, not yet implemented.** The schema and behaviour in section 4 is the build
target.

---

# Part 1 — Inventory costing

## 1.1 The defect this fixes

`sale_items` has no cost column. `computeGrossProfit` and `computeCogs` in
`frontend/src/features/reports/compute-profit.ts` read the product's **current** `costPrice`.
Proven in `frontend/src/features/reports/__tests__/defect-3-profit-history.test.ts`: one immutable
sale reports gross profit **500** when sold at cost 100, **100** after the cost is restated to 140,
and **1500** if the product is later deleted, because a missing product silently becomes cost 0.

Yesterday's signed report changes today with no record that it changed. This is a live financial
misstatement, not a display bug.

## 1.2 The four methods, and what the standards permit

| Method | IFRS (IAS 2) | US GAAP (ASC 330) |
| --- | --- | --- |
| FIFO | Permitted | Permitted |
| Weighted Average Cost | Permitted | Permitted |
| LIFO | **Prohibited** | Permitted |
| Specific Identification | Required for non-interchangeable goods; **explicitly inappropriate** for large populations of interchangeable items | Permitted |

IAS 2 para 25: inventory "shall be assigned by using the first-in, first-out (FIFO) or weighted
average cost formula." Para 27 defines weighted average and permits recalculation "as each
additional shipment is received" — the authority for perpetual moving average. Para 24 rules out
specific identification where "there are large numbers of items of the same nature which are used
for the same purpose," because "the method could be used to manipulate profit outcomes."

LIFO was eliminated for "lack of representational faithfulness of inventory flows" (IAS 2 BC19),
replacing the old SIC-1 alternative. Under US GAAP it is also tax-conditional: electing LIFO for tax
purposes conditions you to use it for financial reporting (IRS conformity rule).

Sources: [IAS 2 (IFRS Foundation)](https://www.ifrs.org/content/dam/ifrs/publications/html-standards/english/2026/issued/ias2.html),
[PwC IAS 2 cost formulas](https://viewpoint.pwc.com/dt/uk/en/iasbv2/part-c/IAS_2_Inventories/IAS02_TI0023/IAS02_gBC9-BC23.html),
[Deloitte IFRS/US GAAP comparison](https://dart.deloitte.com/USDART/home/publications/deloitte/additional-deloitte-guidance/roadmap-ifrs-us-gaap-comparison/chapter-1-assets/1-4-inventories),
[PwC Inventory Guide](https://viewpoint.pwc.com/dt/us/en/pwc/accounting_guides/inventory/assets/ivguide0425.pdf)

## 1.3 Decision: moving weighted average cost, snapshotted immutably

**Moving Weighted Average Cost (WAC), per product, with the resulting rate frozen onto the sale line
at the moment of sale and never recomputed.**

The snapshot is the correctness fix. The formula choice is a maintenance decision.

### Why WAC

**Simplicity for a non-accountant owner.** One number per product, hand-editable, no layer queue, no
reposting engine. Frappe's own guidance is that "for small businesses, it is generally restricted to
FIFO and Moving Average," recommending moving average "if cost of any item fluctuates very
regularly." Odoo's landed-costs documentation confirms the mechanism: a loose, hand-entered cost
process is exactly the case where AVCO survives and FIFO layer integrity does not.

**Auditability in two independent layers.** The rate is derived from a documented IAS 2 para 27
expression an accountant can verify, *and* frozen onto the sale line so any single historical sale
reconstructs from that row alone with no ledger replay. The second layer is what is missing today.

**Accuracy.** WAC smooths FX-driven landed-cost volatility, the dominant source of noise in West
African retail. IAS 2 permits it explicitly.

### Why not the alternatives

| Rejected | Reason |
| --- | --- |
| **FIFO** | Requires reliable layer integrity that a hand-edited cost process will not provide. Same accuracy as WAC for interchangeable retail goods, higher structural cost. ERPNext's own analysis shows both permitted practical methods require reposting on backdated entries; only Standard Cost avoids it, and Standard Cost drifts from reality when purchases are irregular. |
| **LIFO** | IFRS-prohibited. Optimises tax timing, not reporting accuracy. Not a live option. |
| **Specific ID** | IAS 2 para 24 explicitly inappropriate for interchangeable populations — our entire catalogue. Structurally incompatible with offline multi-writer sync: serial/batch identity would have to sync before the sale could be confirmed. |

### The tradeoff, stated honestly

**WAC cannot tell you which physical shipment a unit came from.** In a rising-cost environment it
under-reports COGS relative to FIFO, because FIFO moves the cheap older stock out first. Selling 3
units, FIFO yields COGS €30 / 75% margin, Average Cost yields €45 / 62.5% margin. For pharmacy
expiry-tracked stock or serialised electronics this is a real accuracy loss.

If per-lot cost is ever needed, that is an **additive feature, not a change of method**. Do not
reopen the method choice later; ship the snapshot on the existing single cost field first.

## 1.4 Snapshot source: client-reported, server-clamped, never server-authoritative

| Option | Verdict |
| --- | --- |
| Server-authoritative cost at sync time | **Rejected.** Systematically wrong for exactly the case this product exists to serve. A server has no way to know what a product cost was on a till at 14:03 on Tuesday, three days and four syncs ago. Any design pretending otherwise is asserting a fact it does not have. |
| Client-reported snapshot | **Adopted.** The only correct answer for a long-offline sale. Tamperable, but that is a real trade-off taken deliberately, and the clamp below bounds it. |

Concretely:

1. Accept the client snapshot when it falls inside the product's current cost ±10%.
2. When outside the band, **accept it and flag it**. Never silently substitute. Silent substitution
   reproduces this exact bug in a new location and destroys the audit trail the snapshot exists to
   create.
3. Record the exception so it is visible in period reporting.

**No mainstream system does this properly today.** ERPNext's `SalesInvoiceItem` has no `cost_unit`
and no `valuation_rate` at all — the gross-profit path is a live join (`"buying_rate":
"valuation_rate"`), with a transaction-time rate used only as a silent *fallback* after other
sources. Odoo states that under AVCO "the used value is always the current average unit cost."
Shopify keeps cost in a single current field per product. A fallback chain is neither auditable nor
stable — the stored number depends on which source happened to answer. A single immutable snapshot
is strictly better for an offline-first system.

This is also unclaimed competitive ground: the identical complaint in ERPNext's issue tracker —
"why would anyone expect the value/cost of an item to change depending on the document you use in
the system?" — is unresolved. That question is our pitch.

Sources: [ERPNext `sales_invoice_item.py`](https://github.com/frappe/erpnext-14/blob/8861a76b/erpnext/accounts/doctype/sales_invoice_item/sales_invoice_item.py),
[frappe/erpnext#35240](https://github.com/frappe/erpnext/issues/35240),
[frappe/erpnext#41996](https://github.com/frappe/erpnext/pull/41996),
[Odoo inventory valuation](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/inventory_valuation/cheat_sheet.html),
[Frappe FIFO and Moving Average](https://docs.frappe.io/erpnext/fifo-and-moving-average)

## 1.5 Backfill for existing sales: leave NULL, never backfill

**`unit_cost` stays NULL. There is no backfill.**

Backfilling with current cost fabricates a financial record. Once today's cost is written into a
March sale line, that document asserts a fact we do not know, with no field recording that the value
was invented — making it structurally indistinguishable downstream from a real snapshot. It converts
a *visible* wrong number into an *invisible* wrong one, which is strictly worse for trust.

Consequences, all deliberate:

- `cost_basis IS NULL AND unit_cost IS NULL` means **"cost unknown."** The UI renders "cost
  unknown", not a zero and not an estimate presented as fact.
- Period reports expose **two separate figures**: reported gross profit (snapshot-backed only) and
  estimated gross profit. Never a blended single number.
- A provisional figure, if ever wanted for a historical sale, is written with
  `cost_basis = 'estimated_backfill'` into a structurally distinct path, never by overwriting a
  snapshot.

## 1.6 Provisional vs final costing

Odoo and ERPNext both do this, and neither can do it as cleanly as we can because both rely on an
online server that can be re-reconciled.

Odoo's AVCO takes "Purchase Price: estimated price of products at the reception of the goods (since
vendor bills may arrive later)," adjusted "at reception of the vendor bill," with the offset to a
**Price Difference Account**. ERPNext uses a temporary "Stock Receipt But Not Billed" GL account.

Our pattern on the append-only ledger:

1. **Sale posts** the clamped client snapshot. Gross profit computes from it. The row is now
   immutable.
2. **A later purchase received at a different unit cost does NOT restate the sale.** It posts a
   separate append-only `cost_variance` movement referencing the original.
3. **Period reports show cost variance as its own line**, distinct from gross profit.

This is a genuine business signal that Odoo and ERPNext lose into a clearing account: persistent
negative variance on a product means the hand-entered cost is drifting from reality and that
product's profit deserves scepticism.

## 1.7 Revenue, credit sales, and negative stock

**Revenue** is recognised at the point of sale, full stop. IFRS 15 para 31: revenue when the
customer obtains control of the asset — for goods leaving a till, the instant of handover. **Credit
does not defer revenue.** A credit sale is revenue on the sale date and the customer balance is
accounts receivable, not deferred revenue. IAS 2 para 34 ties this to costing directly: inventory
cost is expensed "in the period in which the related revenue is recognised," so the cost snapshot and
the revenue point must be the same instant — an independent argument for snapshotting at the till.

Payment method as a tag (cash, transfer, POS terminal, credit) is four settlement classifications of
one revenue event and is unaffected by this work.

**Negative stock.** Quantity may go negative — that is intended offline-ledger behaviour and is not
changed here. But a negative quantity is not an inventory asset and has no carrying amount to
expense.

| Concern | Behaviour |
| --- | --- |
| Sale line `unit_cost_snapshot` | Last known positive cost for that product |
| Gross profit on the sale | Computes normally — the P&L stays continuous |
| Inventory carrying value | **Zero.** No stock value reported for negative quantity |
| Quantity returns positive | Rate recomputed by the standard WAC formula; reporting resumes |
| Owner visibility | Flagged as a costing exception, never silent |

ERPNext's documented behaviour is the practical precedent: "Negative stock is only allowed if
valuation method is Moving Average. If stock goes into negative, stock value treated as zero." Note
that ERPNext only permits negative stock under Moving Average — an independent vote for section 1.3.
This is a deliberate, disclosed divergence from strict lower-of-cost-and-NRV presentation, confined
to the balance-sheet line rather than the P&L.

---

## 2. Implementation

Ship this sprint, as one change:

- `sale_items.unit_cost` — the immutable snapshot. `NULL` means unknown, never guessed.
- `sale_items.cost_basis` — `snapshot` | `provisional` | `estimated_backfill`.
- `sale_items.product_version` — pins the product row so soft delete cannot change a posted number.
  **The snapshot alone does not fix the soft-delete path; both are required.**
- `cost_flags` — carries `out_of_band`, `backfilled`, `negative_stock`, `provisional`.

Do **not** add `cost_total`, `gross_profit`, or `profit_margin` as stored columns. Derived values
must be computed, or the rewrite bug reappears at a second location.

The Postgres schema and the Dexie/IndexedDB schema must match exactly; offline merge depends on
identical shape. Migration must be forward-only.

### Explicitly deferred

| Deferred | Why not now |
| --- | --- |
| Moving average recomputation engine | The snapshot is the correctness fix. Ship it on the existing single cost field first. |
| `cost_variance` movement type and clearing account (1.6) | Needed once purchase costs actually differ from hand-entered costs at receipt. Not needed to stop the rewrite. |
| Backfill tooling | The correct action is no backfill. Do not build the temptation. |
| Per-product FIFO/WAC toggle | One method. A toggle contradicts the simplicity argument and doubles the QA matrix. |

---

# Part 2 — Customer pricing

## 2.1 What it actually costs us to run

Vercel **Pro $20/mo** (required — Hobby is not licensed for commercial use and has hard caps with
no overage). Included: 1 TB data transfer, 10M edge requests, 100 GB origin transfer. Overage:
$0.15/GB transfer, $0.06/GB origin, $2.00/M edge requests.

Supabase **Pro $25/mo**. Included: 100k MAU, 8 GB disk, **250 GB egress**, 100 GB storage,
**2M Edge Function invocations**, 5M realtime messages, 500 realtime peak connections, 7 days of
daily backups. **PITR is a $100/month add-on.**

| Fixed | Monthly |
| --- | --- |
| Vercel Pro | $20 |
| Supabase Pro | $25 |
| Supabase PITR | $100 |
| **Total fixed** | **$145** |

**Genuine metered marginal cost is under $0.10 per business per month.** A six-branch shop doing
2,000 sale lines/day moves ~90 MB/month of sync egress and ~600 Edge Function invocations — both
comfortably inside every allowance.

Vercel's bill scales with bandwidth and edge requests, not seats. For a cached PWA shell plus small
JSON sync payloads, the allowances will not be approached. **Vercel is effectively a flat $20, not a
per-customer variable.**

Egress becomes the dominant variable only past ~167,000 sync lines/month per business (~5,500/day),
and only immediately if we start shipping product images.

**So the economically meaningful number is allocated fixed cost:** $1.45/business at 100 tenants,
$0.29 at 500, $0.15 at 1,000. Realistic fully-loaded marginal cost: **$0.30–$1.50/business/month**.
Everything above that is support labour, which is the actual cost base and the reason we cannot price
at $0.50.

Sources: [Vercel Pro plan](https://vercel.com/docs/plans/pro-plan), [Vercel pricing](https://vercel.com/pricing),
[Vercel limits](https://vercel.com/docs/limits), [Supabase pricing](https://supabase.com/pricing),
[Supabase billing docs](https://supabase.com/docs/guides/platform/billing-on-supabase)

### Two cost traps to design against now, cheap to fix and expensive to retrofit

- **Edge Functions must be invoked per sync batch, not per row.** Per sale line at 100 shops ×
  2,000 lines/day = 6M/month, crossing the 2M allowance into $2/million.
- **Realtime allowances are org-wide, not per-tenant.** 100 shops holding one persistent
  subscription is 100 peak connections immediately, and every broadcast multiplies across all
  subscribers — so one chatty tenant imposes cost on others. An offline-first design should read
  from IndexedDB, not a live socket, on most screens.

## 2.2 What the market charges

### Nigeria — the set that actually matters, same currency, same buyer

| Product | Published price | Source |
| --- | --- | --- |
| SwiftPOS | ₦3,000 Starter (100 products) / **₦6,000 Standard** (1,000 products, 5 staff, full P&L) / ₦12,000 Pro (multi-branch, 15 staff) | [swiftpos.ng](https://swiftpos.ng/pricing/) |
| OnTrack | ₦3,500/mo / ₦10,000 / ₦30,000 Gold, free tier | [ontrack.ng](https://ontrack.ng/pricing) |
| AiPOS | ₦6,000 / ₦12,000 / ₦18,000 / ₦25,000 | [aipos.ng](https://aipos.ng/pricing) |
| Tracepos | ₦7,500 / ₦10,000 / ₦18,000 / ₦25,000 — **all unlimited users and unlimited locations**, free offline mode | [tracepos.net](https://www.tracepos.net/pricing) |
| FastInventory | ₦8,999 (1 outlet) / ₦49,999 (20 outlets) | [fastinventory.biz](https://fastinventory.biz/) |
| CliqPOS | ₦15,000 single / ₦28,000 multi-cashier / ₦55,000 multi-branch | [cliqpos.com](https://cliqpos.com/nigeria) |

**Market structure:** entry band **₦3,000–₦6,000** for 1–2 locations. Multi-branch band
**₦12,000–₦28,000**. Every local vendor makes multi-branch a large multiple of single-branch
(SwiftPOS 4×, CliqPOS 3.7×) because branch count is exactly where complexity lives.

Useful competitive intel: buyers are accustomed to per-seat and per-location pricing, so unlimited
users is a real differentiator rather than a discount signal.

### Global, for reference

Loyverse: POS free, unlimited sales history $5/mo/store, employee management $25/mo/store, **no
per-employee or per-device charges**. Square Plus $49/location. Shopify POS Pro +$89/location.
Lightspeed $89–$289. Zoho Inventory $29/org. Toast POS $69. Odoo Standard €24.90/user → €31.10 at
renewal, with implementation running $5,000–$200,000. Frappe Cloud $5–$50/site flat, unlimited
users. Vend $119–$159/outlet.

Two things worth internalising:

- **The market is bifurcating between per-seat and per-store.** The two cheapest credible offerings
  — Frappe Cloud at $5/mo flat and Loyverse with explicitly no per-employee charges — are both
  flat or near-flat with unlimited users. That is independent validation of a flat tier with a
  branch cap.
- **At six branches, Loyverse costs $30/mo (₦40,500).** Our unlimited-branch tier is not a discount
  strategy in this market; it is the cheap end of it.

**Not one local vendor mentions cost snapshot accuracy, immutable history, or audit-grade ledger
integrity as a headline.** They compete on reports, loyalty, WhatsApp, FIRS receipts, and hardware.
The correctness problem we are solving is unclaimed ground, which makes it a premium opportunity
rather than a checkbox.

## 2.3 Recommended pricing

FX ₦1,350/USD for planning.

> ### ✅ Resolved: Free tier confirmed by owner for launch
>
> **Decision (2026-10-01):** The owner confirmed: *"Let's do a free tier for now."*
>
> **Reconciled plan structure across documents:**
> - **Free Tier (₦0 / Forever):** 1 branch, up to 75 products, core offline POS, credit/debt tracking. Zero risk for new shops to onboard and build daily trust.
> - **Starter / Pro (₦5,000 / month / ₦50,000 annual):** 1 branch, unlimited products & barcodes, staff logins with role permissions, net profit reporting.
> - **Growth / Enterprise (₦12,000–₦15,000 / month):** Up to 6 branches, immutable cost snapshots, audit exports, inter-branch stock visibility, and branch P&L rollups.
>
> **Unit economics of the free tier:**
> Because variable marginal cost is under $0.10/shop/month (with database footprint under 1 MB at a 75-product cap), the free tier does not endanger infrastructure margins while driving time-to-first-sale and word-of-mouth acquisition across Nigerian retail merchants.

| | **Free** | **Starter (Pro)** | **Growth (Enterprise)** |
|---|---|---|---|
| **Naira** | **₦0 / forever** | **₦5,000 / month** | **₦12,000–₦15,000 / month** |
| **USD** | $0 | ~$3.70 | ~$8.89–$11.11 |
| Annual | — | ₦50,000 (2 months free) | ₦120,000–₦150,000 (2 months free) |
| Branches | 1 | 1 (up to 3 in roadmap) | up to 6 |
| Products | 75 | 1,000 (unlimited in roadmap) | unlimited |
| Staff | 1 cashier | unlimited | unlimited |
| POS + offline-first sync | yes | yes | yes |
| Append-only stock ledger | yes | yes | yes |
| Credit sales | yes | yes | yes |
| Cost-snapshot history + audit export | — | — | yes |
| Branch-level P&L reporting | — | — | yes |

**Margins against fully allocated cost** ($145 fixed ÷ 100 tenants = $1.45 allocated + ~$0.05
variable = $1.50):

| Tier | Revenue | Allocated cost | Gross margin |
|---|---|---|---|
| Starter | $3.70 | $1.50 | ~59% |
| Growth | $8.89 | $1.50 | ~83% |

**The real insight: Starter carries ~59% gross margin, Growth ~83%, on identical infrastructure.**
Starter is an acquisition tier. Growth is where the business lives. Plan for Starter to carry a
higher support burden per naira — single-branch owners are hands-on with price and margin — so do not
let Starter's thin margin quietly subsidise Growth's unstaffed support load.

**Two months free on annual** matches Loyverse's published convention and, in a market with real FX
volatility, an annual Naira price is a genuine risk hedge for us and a perceived-value anchor for
the buyer.

### Where each tier sits

- **Starter ₦5,000** sits above the ₦3,000 bottom and level with SwiftPOS Standard. **It must be
  justified on POS + offline-first + ledger integrity, not on inventory features.** Odoo One App
  Free gives one app with unlimited users, hosted, at zero cost — and Inventory is an app. "Cheaper
  than global ERP" is a weak pitch. "Correct and works offline" is not.
- **Growth ₦12,000** lands exactly on SwiftPOS Pro and AiPOS Growth — both explicitly the
  multi-branch tiers — and below Tracepos ₦18,000 and CliqPOS ₦28,000. **We are priced at the market
  median for multi-branch, not above it.** No premium brand equity required.

### Why flat, branch-capped, unlimited users

- Marginal cost is under $0.10. A usage meter would be pricing noise.
- Independent validation from the two cheapest credible comparables (see above).
- Charging per branch punishes exactly the customer we want: the 3–6 branch owner who has
  consolidated and needs to scale without renegotiating.
- The branch cap still earns its keep — 1 to 6 branches is a genuine step change in support load and
  reporting depth. Growth earns that.

### Optional premium tier

A third tier at **₦15,000–₦18,000**, positioned explicitly on cost-snapshot immutability and audit
export. No local competitor claims it, and the owner who has been burned by a profit number that
changed will recognise the problem instantly. Tracepos ₦18,000 is the natural anchor.

### Where comparable pricing is not publicly available

Stated rather than invented:

- Lightspeed and Toast do not publish per-additional-location or per-register prices. Any
  multi-branch figure from any source is extrapolation.
- Vend pricing is aggregator-sourced (three aggregators agree, checked July 2026); Vend's own site
  is sales-gated. Medium-high confidence, not verified.
- No Ghanaian, Kenyan, or Ivorian POS vendor published prices could be verified.
- Nigerian payment-processing rates are deliberately excluded — this product records payment method
  as a tag and never touches card data, per `.agents/rules/payment-and-pci-scope.md`.

## 2.4 One thing not to say in a sales conversation

We are carrying a **$100/month fixed PITR cost that Frappe Cloud includes at its $5/month tier**.
We therefore cannot claim backup superiority. We can claim **ledger-integrity superiority**, which
is the claim that matters: Frappe and Odoo both genuinely have a reposting engine, and we are
append-only by rule. Backdated corrections are separate entries, never silent rewrites.

---

## 3. Sources

IFRS Foundation IAS 2 and IFRS 15; PwC IAS 2 cost formulas and Inventory Guide; Deloitte IFRS/US GAAP
comparison; FASB ASU 2015-11; Frappe docs on FIFO/Moving Average and valuation rate; Odoo inventory
valuation, average price valuation, landed costs; Intuit QuickBooks FIFO support; ERPNext
`SalesInvoiceItem` source and issues #35240 / #41996 / #48265; Landara on COGS and cost layers;
Vercel and Supabase published pricing; Nigerian vendor published pricing pages; Loyverse, Square,
Shopify, Lightspeed, Toast, Zoho, Vend, Odoo published pricing.