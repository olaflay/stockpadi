# SPEC: Contacts Hub

| | |
|---|---|
| Status | DRAFT for the SPEC gate (DOUBT done, awaiting human review) |
| Feature | Master audit row 2j (docs/complete-improvement-audit.md) |
| Owner | StockPadi product + engineering |
| Date | 2026-08-25 |

---

## 0. Document map (read this first)

This is the specification for the **Contacts Hub**: one easy-to-access place in Settings where every saved contact lives, with one-tap switching between Customers, Debtors, and Suppliers.

The document follows the Company OS gate order: **DOUBT (section 1) → SPEC (sections 2–15) → what comes next (section 16: PLAN, BUILD, VERIFY, REVIEW)**. It is written to be reviewed in one sitting. Every claim about the codebase was verified against `frontend/src` on 2026-08-25, not assumed.

---

## 1. Phase 0 — Scope check (capability map)

This feature bundles three independently testable capabilities. They share one screen, but each can ship and be verified separately:

| Module | Responsibility | Depends on |
|---|---|---|
| `contacts-view` | Settings → Contacts list: filter chips (All / Customers / Debtors / Suppliers), search, count badges, empty/no-results states | existing `customers`, `suppliers` tables |
| `contacts-actions` | Contact detail sheet: call, WhatsApp, remind debtor, view balance | `contacts-view`, existing `buildWhatsAppUrl` |
| `contacts-manage` | FAB add-contact sheet (name, phone, kind), edit, safe delete, phone normalization | `contacts-view`, `contacts-actions` |

Build order: `contacts-view` → `contacts-actions` → `contacts-manage`. Each maps to its own section below (5, 6, 7). One spec is enough: the modules share one screen and one data story.

---

## 1b. DOUBT — is this worth building? (the gate before the spec)

**The evidence it answers:**

| Evidence | Grade | Source |
|---|---|---|
| "The debtor book is the retention hook. A vendor with ₦180,000 owed across 22 customers, tracked in this app, cannot leave." | A (review-grounded) | RESEARCH-AND-PLAN §4.3 |
| "Remind on WhatsApp: opens WhatsApp to that customer's number with a pre-filled, polite message including balance and shop name" — already requested in the plan | A | RESEARCH-AND-PLAN §4.3–4.4 |
| Customer credit data already exists (`customerCreditMovements` → `getCustomerCreditBalance()`) and is currently only reachable through two deep routes (Customers list, then a customer page) | A (code-verified) | frontend/src |
| Suppliers are stored separately (`suppliers` table) and only visible inside the Purchase flow; a shop owner has no single place listing everyone they deal with | A (code-verified) | frontend/src/lib/db.ts |
| User requirement (2026-08-25): "All contacts saved should be in a section in settings with a search and filter button... separated under supplier, debtor or customers, and you can save new number from there with the floating button at the bottom" | — | user |
| Linking doctrine: no daily task should require hunting across screens (master audit §2.6) | A | complete-improvement-audit.md |

**What this is NOT (rejected at the doubt gate):**

- NOT an address-book sync (reading the phone's contacts requires permissions we refuse to ask for at setup; the audit demoted barcode-scan permission for the same trust reason).
- NOT a CRM (no notes history, no follow-up scheduling, no campaign tooling).
- NOT payment processing (the locked boundary stays: payment-as-tag).
- NOT SMS sending via a paid gateway (wa.me links only; free, no API, no budget impact).

**Verdict:** BUILD. The data already exists in two tables; the hub is a view over it plus two small screens (detail sheet, add sheet). It is the cheapest high-retention feature in the queue.

---

## 2. Objective

**What we're building:** a Contacts Hub in Settings where the owner (and staff, read-only for management) can see every customer, debtor, and supplier in one place, switch between them with filter chips, search them, open a contact to call/remind/WhatsApp them, and add a new number from a floating button.

**Why:** retention (the debtor book) and speed (one place for every relationship, no hunting).

**The user stories:**

- As a shop owner, I want to see all my customers, debtors, and suppliers in one place, so I know who owes me and who I buy from without opening three different screens.
- As a shop owner, I want to tap a debtor and send a WhatsApp reminder with their balance, so I get paid without awkwardness.
- As a cashier, I want to add a customer's number quickly from the contacts screen, so I never lose a sale waiting for an old flow.
- As an owner, I want to delete a contact I saved by mistake, but never delete one with history, so my books stay truthful.

**Success, reframed as measurable conditions:**

- A shop owner can open Settings → Contacts and see a debtor with an open balance in **≤ 3 taps**.
- A debtor reminder (WhatsApp message with balance) is sent in **≤ 5 taps** from entering the hub.
- Adding a new contact (name + number + kind) takes **≤ 30 seconds**.
- Zero network calls on the critical path: the hub renders from Dexie instantly, online or offline.
- No data-loss path: a contact with transactions can never be deleted.

---

## 3. ASSUMPTIONS (correct me now, or I proceed with these)

1. The hub lives at **Settings → Contacts** (a new row), not a bottom-nav tab (nav is locked at 5 tabs; Contacts is a Settings destination).
2. **Debtors are a derived view**, not a stored type: a customer is a debtor when their credit balance > 0 (computed by the existing `getCustomerCreditBalance()`).
3. **No new database table.** The hub reads the existing `customers` and `suppliers` tables. A person who is both customer and supplier appears once in the "All" view with both badges (display-level merge only; the two records stay separate underneath).
4. **Phone numbers** are stored in whatever format they were entered today; the hub normalizes for display and for `buildWhatsAppUrl` (verify it handles `0803… → 234803…`; extend `lib/whatsapp.ts` if it does not).
5. **Roles:** all account types can view contacts and add contacts (a cashier adds a customer mid-sale today). Only Owner/Admin can edit or delete.
6. Offline behavior: the hub works fully offline (Dexie-local) and syncs like every other table.
7. The feature ships as **sheets, not new pages** (modal doctrine, master audit §2.7): detail = bottom sheet, add = bottom sheet.

---

## 4. Users & roles

| Role | Can see | Can add | Can edit/delete |
|---|---|---|---|
| BUSINESS_OWNER / ADMIN | All contacts, all filters | Yes | Yes |
| WORKER | All contacts, all filters (needed to pick a debtor/customer at checkout and to remind) | Yes (name + phone at point of sale) | No (delete/edit hidden) |

The hub is visible to all roles from Settings. For WORKER, the manage actions (edit/delete) are hidden, not just disabled.

---

## 5. Module `contacts-view` — the hub screen

### 5.1 Entry (decided: three entry points, one primary)
1. **Primary: Settings → Contacts**, placed at the **top of the Settings list** (after Profile, before Business) — it is a daily-use destination, not a buried row.
2. **Contextual: Home "Who owes you" card** (feature 2e) deep-links here pre-filtered to **Debtors**.
3. **Contextual: checkout credit flow** already picks a customer — unchanged.

No bottom-nav slot (locked at 5 tabs, master audit §2.6). The hub is one tap from anywhere: Settings is a tab, Home is a tab.

### 5.2 Layout (top to bottom)
1. `ScreenHeader` "Contacts" (back button; the Settings back target).
2. **Search field** (existing `TextInput` with leading search icon): filters by name or phone, substring match, case-insensitive. Debounced 120ms (existing `useDebounce`).
3. **Filter chips** (M3 tonal chips, one row, horizontal scroll): **All · Customers · Debtors · Suppliers**, each with a live count badge (e.g. "Debtors 22"). Selected chip = filled (brand accent container), rest outlined. `aria-pressed` on each.
4. **The list**: one row per contact.
   - Customer/debtor row: avatar circle (initials), name, phone (muted), right side: credit balance chip if > 0 (warning container), chevron.
   - Supplier row: same, right side: "Supplier" badge (neutral container), total purchased (muted), chevron.
   - "Both" display (same phone in both tables): ONE row, name once, both badges (Customer + Supplier), credit balance if any.
5. **FAB** (bottom right, above safe area): plus icon, aria-label "Add contact". Renders only for roles that can add (all roles can).
6. States: loading = `Skeleton` rows; zero contacts total = `EmptyState` ("No contacts yet — add your first customer or supplier", action: opens add sheet); search with no matches = `NoResultsState` ("No contacts match 'xyz'"); offline = normal (data is local).

### 5.3 Rules
- Counts are live (recompute on every data change via `useLiveQuery`).
- Debtor count = customers with balance > 0 (not stored).
- List order: All = customers then suppliers, each alphabetically by name; Debtors = balance descending (the retention order); Customers/Suppliers = alphabetical.
- Rows are tappable → opens the detail sheet (module `contacts-actions`).

---

## 6. Module `contacts-actions` — the detail sheet

Tap any row → **bottom sheet** (not a page; modal doctrine):

- Handle + drag indicator; X close (both exist in the app's sheet pattern).
- **Header:** avatar initials, name, kind badges, phone (tappable: `tel:` link).
- **Debtor block** (if balance > 0): balance in `--color-warning` container, one-line copy "Owes you ₦X across N sales".
- **Supplier block** (if supplier): "Total purchased ₦Y" (sum of linked purchases).
- **Actions (icon + label rows, M3 sheet pattern):**
  - **WhatsApp** (primary, emerald): `buildWhatsAppUrl(phone, message)` — message pre-filled per kind: debtor → "Hello {name}, this is {shop}. Your outstanding balance is ₦X. Thank you!"; customer → "Hello {name}, thank you for shopping at {shop}."; supplier → "Hello {name}, this is {shop} regarding our account."
  - **Call** (outline): `tel:` link.
  - **Edit** (Owner/Admin only): opens the add/edit sheet pre-filled (module `contacts-manage`).
  - **Delete** (Owner/Admin only, only when safe): see 7.4.
- No dead end: X always visible; back returns to the hub.

---

## 7. Module `contacts-manage` — add / edit / delete

### 7.1 Add (FAB → bottom sheet)
- Fields (sentence-case labels): **Name** (required), **Phone** (required, digits only, auto `+234` prefix — user types `0803…`, the field normalizes to `+234 803…`), **Kind** chips: **Customer · Supplier · Both** (single-select; default Customer).
- Validation: name non-empty; phone ≥ 10 digits after normalization; inline field errors (never a wall).
- Save (one primary emerald button "Save contact"):
  - Customer → upsert `customers` (name, phone).
  - Supplier → upsert `suppliers` (name, phone).
  - Both → upsert BOTH tables with the same phone (two records, display-merged in the hub; no hard link field — documented open question 18.3).
- Success: toast "Contact saved", sheet closes, list updates live.

### 7.2 Edit (from detail sheet)
- Same sheet pre-filled; Save updates the record(s). Phone change updates the record only (historic sales keep their original references; no cascade).

### 7.3 Phone normalization
- One helper in `lib/whatsapp.ts` (or a new `lib/phone.ts`): strip spaces/dashes, `0` prefix → `+234`, `+234` kept, `234` bare → `+234`, reject < 10 digits. Used by add/edit, display, and `buildWhatsAppUrl`.

### 7.4 Delete (safe-delete rule)
- **A contact with any transactions (sales, credit movements, purchases) cannot be deleted.** Delete is hidden for such rows; the detail sheet shows "Has transaction history — kept for your records" instead.
- Contacts with zero transactions: confirm sheet first — "Delete {name}? This can't be undone." (danger container, destructive tone) → Delete / Cancel.
- Rationale: the ledger must never lose its referential truth (audit: master audit §2g confirm-modals doctrine).

---

## 8. Data model (verified against the codebase, no schema change)

| Table | Exists | Fields used | Source |
|---|---|---|---|
| `customers` | ✅ | `id, name, phone, updatedAt` (+ credit derived from `customerCreditMovements` via `getCustomerCreditBalance()`) | frontend/src/lib/db.ts:52,134 |
| `suppliers` | ✅ | `id, name, phone` | frontend/src/lib/db.ts:143; purchases/new adds via `addSupplier({name, phone})` |
| `purchases` | ✅ | `supplierId` (for total-purchased + purchase history) | frontend/src/types/purchase.ts:25 |
| Sync | ✅ | both tables already in the sync schema (`"supplier"` in types/sync.ts:15) | frontend/src/types/sync.ts |

**No new table. No migration.** The hub is read-only over these plus the credit computation. The only new code is the screen, the sheets, and the phone helper.

---

## 9. Commands (how to build/test/lint this feature)

```bash
# The feature lives in the frontend app
cd frontend

# Typecheck (must pass before any commit)
npm run typecheck

# Tests (vitest; new tests for the hub go in src/features/contacts/__tests__/)
npm test -- contacts

# Lint
npm run lint

# Manual check (dev)
npm run dev
```

---

## 10. Project structure (where the code goes)

```
frontend/src/
  features/contacts/          → NEW feature folder (mirrors customers/ and purchases/)
    contacts-view.ts          → unified list query: customers + suppliers + balances, display-merge
    contacts-filter.ts        → chip filter + counts (pure functions, unit-testable)
    contact-detail.ts         → detail-sheet state + WhatsApp message builder
    contact-save.ts           → add/edit upsert (customers/suppliers/both)
    __tests__/                → unit tests (filter, merge, save routing, safe-delete)
  components/ui/ContactChip.tsx        → kind badge (Customer/Supplier/Both)
  components/ui/ContactsFab.tsx        → FAB (or reuse existing FAB pattern if present)
  lib/phone.ts                → phone normalization helper
  lib/whatsapp.ts             → extended (if needed) for E164 normalization
  app/(app)/settings/…        → Settings row → /contacts route
  app/(app)/contacts/page.tsx → the hub screen
```

---

## 11. Code style (one real snippet, the filter row)

```tsx
// features/contacts/contacts-filter.ts — pure, testable
export type ContactKind = "all" | "customers" | "debtors" | "suppliers";

export function counts(rows: ContactRow[]): Record<ContactKind, number> {
  return {
    all: rows.length,
    customers: rows.filter((r) => r.kinds.includes("customer")).length,
    debtors: rows.filter((r) => r.balance > 0).length,
    suppliers: rows.filter((r) => r.kinds.includes("supplier")).length,
  };
}
```

Conventions: sentence-case labels, named tokens only (no hardcoded hex/px), one primary button per sheet, chips carry `aria-pressed`, all icons from lucide-react.

---

## 12. Testing strategy

| Level | What | Where |
|---|---|---|
| Unit | filter counts; display-merge (same phone in both tables → one row, both badges); save routing (Customer/Supplier/Both → right table); safe-delete rule; phone normalization (`0803…`, `+234…`, junk) | `features/contacts/__tests__/` |
| Integration | hub renders from seeded Dexie; debtor balance appears; counts update after a credit sale | vitest + existing Dexie test harness |
| Manual | the verification script (section 16) | — |

---

## 13. Boundaries

- **Always:** typecheck before commit; run `npm test -- contacts`; normalize every phone on write; hide (not disable) delete for non-owners and for contacts with history; keep all strings in the product's plain language (no em dashes, no intensifiers).
- **Ask first:** any schema change (none expected — the spec is deliberately schema-free); adding a dependency; changing `lib/whatsapp.ts` behavior for existing callers (close-day, sales, customers pages share it).
- **Never:** hard-delete a contact with transactions; read the device address book; send SMS via a paid gateway; add a sixth bottom-nav tab; store a balance field (always derive from the ledger).

---

## 14. Design system mapping (tokens only)

Chips: `--color-brand-accent` container for selected, `--color-surface-container` for outlined. Debtor balance: `--color-warning-container` / `--color-on-warning-container` (a trading signal, not an error — never danger). FAB: brand accent, `--shadow-elevation-2`. Sheets: `--radius-card` top corners, drag handle, scrim `--color-scrim`. Type: labels `--font-size-label`, body `--font-size-body`, counts `--font-size-caption`. All motion: `--motion-duration-short`, step-in, `prefers-reduced-motion` respected. First-visit coach mark on this page (feature 2k): highlight the filter chips + FAB with one-line labels above them.

## 15. Accessibility

- Chips: real buttons with `aria-pressed`, 44px min target.
- Search: labeled input, results announced via `aria-live` region.
- FAB: `aria-label="Add contact"`.
- Detail sheet: focus moves into the sheet on open, returns on close; X and scrim-dismiss both work; ESC closes.
- Contrast: all states use the AA-checked token pairs.
- Reduced motion: no animations.

---

## 16. Verification (how we know it's done)

**Automated:** `npm run typecheck` green; `npm test -- contacts` green (the unit/integration list in section 12).

**Manual script (the 10-second rule):**
1. Open Settings → Contacts: hub renders instantly, offline (airplane mode on).
2. Tap Debtors chip: only customers with balances show, highest first, count badge matches.
3. Search a debtor's name: one row. Tap it: detail sheet, balance shown.
4. Tap WhatsApp: wa.me opens with the balance message to the right number.
5. FAB → add a supplier "Alhaji Bags" `0803…`: appears under Suppliers instantly.
6. Try to delete a customer with sales: delete hidden, "kept for your records" shown.
7. Delete a fresh no-history contact: confirm sheet appears; Delete removes it.
8. Time the whole debtor-reminder path: ≤ 5 taps from entering the hub.

---

## 17. What comes next (the gates after this spec)

1. **PLAN** (next gate): task breakdown per module (`contacts-view` → `contacts-actions` → `contacts-manage`), each task ≤ 5 files with acceptance criteria.
2. **BUILD**: implement module by module (TDD for the pure logic: filter, merge, save routing, safe-delete).
3. **VERIFY**: run section 16 end to end; typecheck + tests green.
4. **REVIEW**: the review gate against the minimalism doctrine (§2) and performance doctrine (§2.7 of the master audit).

## 18. Decisions (open questions resolved with the best solution)

1. **"Both" records → display-merge.** Two records (customers + suppliers), one merged row in the All view with both badges. No migration, no risk. Revisit only if both-type contacts exceed ~10% of the list.
2. **Delete semantics → hide delete for history contacts.** Never allow a ledger-breaking delete; the detail sheet explains "Has transaction history — kept for your records". Fresh contacts delete via confirm sheet.
3. **FAB default kind → Customer.** Most common at checkout; Supplier is one chip away.
4. **Entry point → Settings top row + contextual deep-links.** Primary: Settings → Contacts at the top of the list (after Profile). Contextual: Home "Who owes you" card → Debtors filter; checkout customer picker unchanged. No bottom-nav slot (locked at 5 tabs).
5. **Message copy → confirmed as specified** in section 6; templates are plain, polite, and carry the balance. Adjust only if the user's voice review objects.

---

*End of spec. Review sections 1b, 3, and 18 first — they carry the decisions that everything else hangs on.*
