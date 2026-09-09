# Improvement: Product Import (CSV/Excel) + Secondary-Navigation Placement

- **In scope:** Making "Add many products at once" genuinely easy: template, upload, validation, and one-tap commit.
- **Also in scope:** A decision on whether the hamburger side drawer's content should move into the bottom interaction area (the navbar is crowded).
- **Status:** RESEARCH (not yet PLAN/BUILD).

---

## 1. Context & Rationale

Retail merchants frequently switch shops or expand stocklists mid-season. Typing 200 products one-by-one into the Add Product form is the #1 onboarding/expansion friction. The import screen already exists (`frontend/src/app/(app)/products/import/page.tsx`) as a clean 3-step flow, but it covers **CSV only**, marks **name / sku / costPrice / sellPrice as user-required**, and **skips categories, brands, and alt units entirely** ("Categories are skipped in Phase 1 CSV import").

This research brief answers three questions with evidence:

1. **Import flow & semantics** — the user's clarified requirements:
   - **Core cells compulsory**: any row missing a core cell (name / SKU / cost / selling price) fails.
   - **Auto-generated SKUs**: if a SKU is blank, generate one exactly like the Add Product flow does, so a merchant never has to invent codes.
   - **All-or-nothing commit**: if any row is incomplete, **nothing** is written to the database. The user asks for a full research pass on how this is "properly done."
2. **Templates** — what a good import template looks like (headers, sample rows, required vs optional markers, downloadable first).
3. **Front-end + back-end best practices** — file formats (CSV today; Excel is a gap), parsing, validation-first, offline-ledger commit, error reporting, and where the work happens.

Plus a secondary question that surfaced mid-review:

4. **Secondary navigation placement** — should the hamburger side drawer's tools (Customers, Sales, Stock Count, Restock, Expenses, Alerts, Close Day) be brought down into the bottom navigation for easier thumb access, since the navbar is crowded?

---

## 2. Current State (verified against code)

### 2.1 The import page — 3 steps, one screen

`frontend/src/app/(app)/products/import/page.tsx`

- **Step 1 "Get the template"** — downloads `stockpadi-products-template.csv` via `buildSampleCsv()`, plus a "Which column is which?" `<details>` drawer listing `COLUMN_HELP` (name*, sku*, costPrice*, sellPrice* required).
- **Step 2 "Upload your file"** — dashed drop label, `<input type="file" accept=".csv">`, parses on select, then shows two stat cards: *Ready to import* / *Need fixing*, a scrollable per-row error list, and hard cap warnings at `PRODUCT_CAP_WARN_AT` (2125) / `PRODUCT_CAP` (2500).
- **Step 3 "Review and import"** — optional branch picker (only when initial stock exists and >1 branch), then a single "Import N products" button.

Current UX pain points observed:
- `accept=".csv"` only — an Excel-first merchant (the common case in Nigerian retail) is blocked.
- The template `buildSampleCsv()` is CSV-only (`text/csv` blob) yet the button label says **"Excel / CSV"**, and the caption says "Opens in Excel, Google Sheets, or Numbers." That is a copy/format mismatch: it *does* open in Excel, but the file is a CSV, not an `.xlsx`.
- No drag-and-drop; tap-to-browse only.
- SKU is **required** in `COLUMN_HELP`, contradicting the Add Product flow where SKU is auto-generated when blank. The user wants alignment: blank SKU in a row → auto-generate.
- Import commit is **per-row best-effort**, not all-or-nothing: invalid rows are already filtered out during parse (they never reach commit), so the page commits only valid rows. But there is **no upfront "all rows must be valid" pre-flight** and no downloadable error file — the merchant must fix errors in their spreadsheet manually against a scrollable list.
- Partial-import semantics aren't surfaced: if a 50-row file has 3 bad rows, the current UI happily imports the 47 good ones. The user has asked for all-or-nothing ("if any core info is missing → nothing added").

### 2.2 Parsing — `frontend/src/features/inventory/csv-import.ts`

- Headers: `name, sku, barcode, costPrice, sellPrice, unitLabel, lowStockThreshold, expiryTracking, initialStock`.
- Papa.parse with `header: true, skipEmptyLines: true`.
- Each row → `productFormSchema.safeParse()` (Zod). On failure, pushes one error per validation issue (`Row N · field: message`) and continues.
- Pre-import dedupe against **existing** SKUs/barcodes *and* **within-file** seen-SKU/seen-barcode sets.
- `initialStockQty > 0` marks `hasInitialStock` (starting-stock branch required later).
- Returns `{ validRows, errors }`.

### 2.3 Commit — `frontend/src/features/inventory/import-products.ts`

- Enforces product cap (blocked → throws).
- Builds `Product[]` (`categoryId: null`, `brandId: null`, `altUnitLabel: null`) + `StockMovement[]` (`source: "initial_stock"`) when `hasInitialStock && branchId`.
- Commits in ONE Dexie transaction: `products.bulkAdd` + `stockMovements.bulkAdd` + per-product/per-movement `enqueueOutboxWrite` (stable clientId → idempotent sync). This is the correct offline-first pattern (durable + convergent). See `.agents/rules/offline-sync-and-ledger.md`.

### 2.4 SKU auto-generation to mirror

`frontend/src/features/inventory/use-new-product-form.ts:75`

```ts
function generateFallbackSku(name: string): string {
  const prefix = name.trim().replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase() || "ITEM";
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${rand}`;
}
```

and the live SKU-fill in `skuSuggestionFor()` (stable 4-digit tail per name stem). The import flow should reuse the **stable** variant (per name, deterministic tail within one file run, not jittering per keystroke) and dedupe the generated SKUs against both existing products and other generated rows.

### 2.5 No Excel support anywhere

`frontend/package.json` has `papaparse` only — no `xlsx`, `exceljs`, or SheetJS. No backend import module (browser-only, offline-first by design). So "Excel" today = "a CSV that happens to open in Excel."

### 2.6 Navigation today

- `frontend/src/features/shells/ExperienceShell.tsx` — Samsung One UI **5-button** bottom interaction area: Dashboard / Sell / Products / Reports / Settings (business shell) and Dashboard / Sell / Products / Stock / Profile (worker shell). "Exactly 5 buttons keep touch targets roomy and thumb-reachable."
- `frontend/src/components/ui/SideDrawer.tsx` — Google Drive-style left side drawer from the top-left hamburger (TopStoreHeader), holding **Operations** (Customers, Sales & Receipts, Stock Count, Restock*, Expenses*, Stock & Alerts), a prominent **Close Day** button, Appearance toggle, and Sign Out. Owner-only items flagged. Drawer is already thumb-reachable only as far as the top-left hamburger is reachable (top of screen — weakest thumb zone).
- "Close Day" is notably the shop's most time-sensitive daily action, yet it currently lives at the *bottom of a drawer* opened from the *top-left corner*. That is the strongest argument for moving some things down.

---

## 3. Research — Import UI/UX & best practices

Evidence: Lazyweb screenshots of real import screens (customer.io, Square, Mailchimp, 1Password, Sprig, Podia, Front, Productboard, Sharewillow, Okta), Shopify CSV docs, and GOV.UK file-upload guidance.

### 3.1 What good import/upload screens do (and what we should copy)

| Pattern | Seen in | Why it matters |
|---|---|---|
| **Sample/template download lives in the same view as the drop zone** | Sprig, Productboard, Sharewillow | A merchant can fetch the template and upload without leaving the screen. Productboard literally pairs "Download CSV template" with the drop area. |
| **Drag-and-drop + browse, both** | Square, Mailchimp, Sprig, 1Password | Touch users tap; desktop/file-manager users drag or browse. The drop target should also accept tap. |
| **Explicit accept formats called out** (.csv, .xlsx) | Square, Productboard | Removes the "will Excel upload?" doubt at the moment of deciding. |
| **Per-file error summary with row numbers, before any commit** | Okta, Customer.io | Okta lists attribute-level CSV errors; Customer.io shows a progress + error block. Errors are listed *before* the import takes effect, never mid-flight. |
| **Column mapping view (template header → product field)** | Front | When the merchant's own spreadsheet has different headers, a mapping step is the only way to use it. **Not needed for our template-first v1**, but it's the upgrade path. |
| **Step progress chips (1-get file / 2-map / 3-upload / 4-review)** | 1Password, Square | Reinforces "everything happens in one place" and gives a sense of progress during long files. Our 3-step layout already does this with numbered badges — keep it. |
| **Success confirmation with count + what happens next** | Podia, Mailchimp | "Imported 47 products" alone is weak; add "now visible in Products, syncing to the cloud" so trust persists after the tap. |
| **Format/limits hints next to the drop zone** (max rows, import time) | Productboard, GOV.UK | GOV.UK file-upload guidance: tell the user the allowed type and any size/row limits *before* they choose the file, and validate early so failures are cheap. |
| **Never commit partial files silently** | Okta | The dominant "proper" pattern is validate-all → report → commit all (or the user explicitly chooses skip-bad-rows). Farm credit/import systems differentiate **row-level good vs fatal**; a row with a typo can be rejected and reported while a structurally sound file still imports — but that choice is always surfaced to the user, never hidden. |

### 3.2 The "proper" import semantics (validated answer to the user's ask)

The all-or-nothing requirement is exactly how serious import tools behave when core identity data is missing:

1. **Parse + validate every row first** (no DB writes during parse).
2. **Classify rows**: *ok* | *blocked-by-core* (missing name/SKU/price — must be fixed by the merchant) | *auto-fixable* (blank SKU → generate; blank unit → "piece"; blank threshold → skip).
3. **If any row is *blocked-by-core* → block the whole import.** Show a per-row error panel ("Row 3 · missing selling price"), and in v1 file-format exports, offer a **downloadable error report CSV** the merchant can reopen, fix, and re-upload.
4. **Only when zero core errors remain** do we commit — in one transaction (we already do: `import-products.ts` is a single Dexie transaction + outbox).

This gives the user both things at once: never a half-imported catalog, and never a skipped row that silently vanished.

### 3.3 Template design

- **Template = the contract.** Every column the app can accept appears, in the same order/names the parser expects, with **two populated example rows** (existing `buildSampleCsv` already does this well — Tomato paste / 5kg Rice).
- **Required vs optional must be visible in the template itself** — bold/asterisked header cells (or a `*` next to `name`, `sku`, `sellPrice`, `costPrice`), plus the same legend in the page's "Which column is which?" details.
- **Include a helper near the header** — Shopify ships column descriptions; we already have `COLUMN_HELP`. Keep it, and add an **errors column convention** is *not* needed (we generate error reports instead).
- **Excel-native template** (`.xlsx`) for v2 — features data validation dropdowns, locked required columns, number-formatted price cells, and a "Download .xlsx / Download .csv" pair.

### 3.4 Front-end + back-end best practices (evidence-based)

| Concern | Best practice | Our gap today |
|---|---|---|
| **CSV parsing** | Client-side with Papa.parse (keep — it handles BOM, quoted commas, CRLF). | None — already used. |
| **Excel parsing** | `xlsx` (SheetJS) or `exceljs` reads `.xlsx`/`.xls` in-browser. Normalize the first worksheet → rows → same `ParsedCsvRow` pipeline, so ALL downstream logic (cap, dedupe, ledger, outbox) is format-agnostic. | No Excel library installed. **Decision needed:** add `exceljs` (keeps RLS/local-first; ~300KB) vs defer Excel to Phase 2. |
| **Validation-first** | Validate all rows before any write; never mutate DB during parse (Okta/Customer.io pattern). | Already the case — parse returns `{validRows, errors}` before commit. |
| **Dedupe** | Unique SKU; barcode unique-if-present; within-file + cross-file; case-insensitive. | Already implemented in `csv-import.ts`. |
| **Cap enforcement** | Double-checked: optimistic on the page, authoritative in the write path. | Already double-checked (`willExceedCap` + `importProducts` product-cap guard). |
| **Atomic commit + offline sync** | One transaction: `bulkAdd` products+movements then `enqueueOutboxWrite` per record with stable clientId (idempotent retry). Matches .agents/rules/offline-sync-and-ledger.md. | Already the pattern in `import-products.ts`. Keep. |
| **Error report export** | On blocked import, generate a CSV of `rowNum, field, message` for download ("Fix these rows, upload again"). | Missing. |
| **Progress during commit** | Indeterminate spinner + "Importing…" is fine for local writes; if we ever move to a server path, ProgressEvent or chunked batches. | Present (Loader2 spinner). |
| **Post-import state** | Success toast with count + explicit "now in Products, syncing in background"; then navigate. | Present, but toast is bare ("Imported N products"). Add the trust sentence. |
| **Categories / brands / alt units** | Phase 2: map an extra `category` column to existing categories, and include `altUnitLabel`/`altUnitConversionFactor`/`altUnitSellPrice` mirroring the Add Product unit-conversion blurb. | Skipped (null) today; fine for v1, but a merchant *will* ask. |
| **File size guard** | Reject huge/zero-byte files early with a friendly message (GOV.UK pattern). | Only .csv. No size guard. |

### 3.5 Where to run the work

- Browser-first is correct for our offline-first architecture (local IndexedDB + outbox) — a server path adds nothing for single-device imports and breaks offline semantics. Keep **all parsing + validation + commit on-device**.
- Excel parsing stays on-device in v1.x via `exceljs`/`xlsx`. A future cloud-import Edge Function is out of scope; if we ever add it, the offline ledger rule still governs the commit path.

---

## 4. Navigation Drawer — Research & Recommendation

### 4.1 The question

The side drawer (Operations: Customers, Sales & Receipts, Stock Count, Restock, Expenses, Alerts; plus the critical Close Day action) is opened from a hamburger at the **top-left** — the least thumb-reachable spot (Samsung One UI explicitly optimizes for the bottom third). The bottom interaction area already has 5 buttons and "is crowded."

**Should we bring drawer content down into bottom navigation?**

### 4.2 Evidence

- **The "More" tab is the industry solution to a full 5-tab bar.** Yelp's bottom nav includes a dedicated More/Menu tab that hosts Messages, Reservations, Orders, Preferences, Bookmarks, Activity, Deals. Financial Times app: bottom nav then a menu drawer reachable from an app-level tab. The Telegraph and Buzzfeed both use a "More" screen at the bottom for overflow sections. When primary tabs + many secondary sections coexist, the overflow **moves into the bottom bar itself** as a final "More" tab — not back up into a hamburger.
- **Side drawers are for content-heavy shells** (news apps like Newsmax, Domino's) where the hamburger *is* the primary navigation and the bottom bar carries a couple of shortcuts. That is not our shape: our bottom bar already *is* primary navigation.
- **Samsung One UI guidance** (our locked design system): primary navigation belongs in the bottom interaction area; the top is for context and scannability. Our comment in `ExperienceShell.tsx` already codifies "exactly 5 buttons keep touch targets roomy."

### 4.3 Recommendation

**Phase A (ship-small, no rework): Keep the side drawer, but move its two most-used daily actions into the bottom zone.**

- The single most time-sensitive action — **Close Day** — should not live behind a top-left hamburger. It is the daily money-reconciliation ritual.
- Bottom interaction area today: Dashboard / Sell / Products / Reports / Settings. It is crowded at 5, but there is room to *earn* a slot: consider replacing one low-frequency tab (Settings) with a **"More" tab**, then:

```
Bottom nav (business shell, proposed):
  Dashboard | Sell | Products | Reports | More
  More → { Close Day*, Stock Count, Customers, Alerts, Restock, Expenses, Settings, Appearance, Sign Out }
  (* Close Day pinned first / as a prominent in-panel button — it already has a designed CTA style in SideDrawer.)
```

- Keep the hamburger drawer for identity/session chrome (store name, appearance, sign out) — those are discoverable, low-frequency, and fine at the top.
- For the worker shell, the analog would be keeping the existing 5 (Stock is already there) — workers rarely need the drawer at all; verify with a real user before adding a More tab there.

**Phase B (structural, follow-up spec): promote the genuinely frequent operations to a contextual quick bar** — e.g., a persistent bottom action row on Dashboard, or parking Close Day as a pinned item in the Dashboard command center (`hub-dashboard.md` already remaps Home with 2×2 quick actions — Close Day is a natural quadrant).

### 4.4 What NOT to do

- Do **not** add a 6th+ permanent nav tab (6+ buttons violates the One UI roomy-touch-target rule and our own comment).
- Do **not** duplicate the whole drawer into the navbar — that's what the "crowded navbar" concern warned against.
- Do **not** silently reorder business tabs to accommodate the drawer; permission/role mapping (owner-only Restock/Expenses) must survive the move.

---

## 5. Conflict Surface (surfaced, not silently resolved)

Per AGENTS.md, conflicts get surfaced to Olaflay:

1. **SKU required vs auto-generated.** Current page marks `sku` as user-required (`COLUMN_HELP`); the Add Product flow auto-generates a fallback. The user's clarified intent says **blank SKU → auto-generate in import too**. This aligns the import page with the Add Product flow and the Samsung "lowest cognitive load" principle. **No product-rule conflict found** — SKU stays unique either way; auto-generation simply fills blanks before dedupe.
2. **All-or-nothing vs today's partial-import behavior.** Today invalid rows are silently filtered out and the good rows commit. The user asked for all-or-nothing (nothing committed if any core row is bad). This is a behavior change to `parseProductCsv`/`import-products.ts` (block on any `blocked-by-core` error; offer error-report download). Need confirmation that *any* core error blocks *all* rows (strict) vs a cop-out "skip bad rows with an explicit toggle" (Shopify-style). Recommended: **strict by default**, with the error CSV making recovery painless.
3. **Excel scope.** Adding `exceljs`/`xlsx` is a new dependency — requires confirmation (trusted-tool-finder rule: research & lock before adding). Also, `.xlsx` is a binary format; we'd keep parsing on-device (no server upload).
4. **Categories/brands/alt-units** remain intentionally skipped in Phase 1 (`import-products.ts:37`). Not a conflict — documented gap; the report lists them as Phase 2 so the merchant-facing copy says "v1 supports these columns."

---

## 6. Proposed Deliverables (next step, after approval)

1. **Import v1.1 (semantics):** blank-SKU auto-generation (mirror `generateFallbackSku`, stable tail, dedupe incl. generated), core-cell blocking per all-or-nothing, downloadable error-report CSV, format/limits hint on the drop zone, success toast with "now syncing in background", button copy fix ("CSV template" not "Excel / CSV" unless we ship Excel).
2. **Import v1.2 (Excel):** add `exceljs` (trusted-tool research first), normalize first sheet → `ParsedCsvRow` pipeline, dual-template download (.csv + .xlsx), `accept=".csv,.xlsx"`.
3. **Nav Phase A:** bottom "More" tab + Close Day promotion (spec follows `hub-dashboard.md` conventions), permission mapping preserved.
4. **Tests:** per `.agents/rules/testing-and-qa.md` — import parse tests (missing core cell, blank SKU auto-gen, duplicate SKU within file + vs DB, barcode handling, generated-SKU collision), the all-or-nothing commit test, and a two-device concurrent-write conflict test (`.agents/skills/write-offline-conflict-test.md`) for the import path since it writes the ledger.

---

## 7. Evidence Index

- Lazyweb Agentic Searches (finalized):
  - [Product/CSV import screens — UI patterns](https://www.lazyweb.com/agentic-search/e1fb0ce3-b68a-4db2-915f-4d4ba12bf1ea) (customer.io, Square, Mailchimp, 1Password, Sprig, Podia, Front, Productboard, Sharewillow, Okta)
  - [Bottom "More" tab vs side drawer navigation](https://www.lazyweb.com/agentic-search/adc3af7d-35c9-448b-920f-3e487a090bcd) (Financial Times, Yelp, Telegraph, Buzzfeed, Domino's, Newsmax, Notion)
- Shopify: [Using CSV files to import and export products](https://help.shopify.com/en/manual/products/import-export/using-csv) — column descriptions, template download, update-vs-overwrite modes.
- GOV.UK Design System: [File upload](https://design-system.service.gov.uk/components/file-upload/) — type/size hints before selection, early validation, error recovery.
- Code: `products/import/page.tsx`, `features/inventory/csv-import.ts`, `features/inventory/import-products.ts`, `features/inventory/use-new-product-form.ts` (SKU fallback), `shells/ExperienceShell.tsx`, `components/ui/SideDrawer.tsx`, `config/limits.ts`.