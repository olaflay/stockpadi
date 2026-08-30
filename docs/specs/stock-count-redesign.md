# SPEC: Stock-Count Redesign (compact list + expandable forms) + Unsaved-Changes Guard

| | |
| --- | --- |
| Status | DRAFT for SPEC gate |
| Features | Master audit rows 2f + 2g (P1) |
| Date | 2026-08-25 |

## 1. DOUBT — why

The existing stock-count page renders one product into a form at a time (code-verified: `activeProduct` + draft state). The user's flow idea: enter the page and see the products as a normal one-line list (like the products page), with a chevron that expands a compact update form for that product only. Benefit: faster loading (only expanded rows render forms) and no wall of expanded details. Row 2g adds the data-loss guard: collapsing an edited row must NOT clear edits, and leaving with unsaved changes asks once.

**Verdict:** BUILD, P1. The `useDraft` hook already persists drafts across navigation — the pattern exists; the redesign applies it per row.

## 2. Objective

Count stock fast: see every product in one line, expand one at a time, edit, save. Nothing is lost by collapsing or leaving.

**Success criteria (measurable):**

- Page loads with all products as one-line rows (name · current stock · unit), forms render ONLY for expanded rows.
- Collapsing an edited row keeps the edits (visible via a dirty dot); Save changes persists.
- Leaving the page with unsaved edits → one confirm sheet: "Discard changes?" (Discard / Keep editing).
- A full count of 100 products completes with ≤ 1 expand per product and no data loss.

## 3. Decisions (best solutions)

1. **Row anatomy:** name (truncate) · current stock (the ledger number) · unit · chevron (rotates on expand). Dirty dot on rows with unsaved edits.
2. **Expand:** only ONE row expanded at a time (accordion). Expanding another row collapses the first but KEEPS its draft (dirty dot stays; draft lives in a per-product map, not in the DOM).
3. **Form (compact, 3 fields + reason):** counted quantity (in the row's unit) · reason (existing `ADJUSTMENT_REASON_CODES` chips) · note (optional, collapsed behind "More"). One button: "Save changes".
4. **Save:** writes `writeStockAdjustment` (existing, ledger-correct) → row shows new stock, draft cleared, toast.
5. **Unsaved-changes guard (row 2g, global):** a `useDirtyGuard` hook — any screen with dirty drafts intercepts back-navigation/route change once, showing the confirm sheet. Scoped to discard/destructive only; never on Save; never on routine nav with nothing dirty.
6. **Search + branch selector stay** (existing query filter + branch chips); results keep the compact row shape.
7. **Empty/no-results:** existing EmptyState / NoResultsState, with "the shelf is full" never appearing (this screen's empty state is "no products match").

## 4. Module map

| Module | Responsibility |
| --- | --- |
| `stockcount-list` | Compact rows, pagination (existing IntersectionObserver), search, branch |
| `stockcount-forms` | Per-row accordion + draft map + save via `writeStockAdjustment` |
| `dirty-guard` | Global unsaved-changes confirm (shared hook, reused by any future form screen) |

Build order: `dirty-guard` → `stockcount-list` → `stockcount-forms`.

## 5. Rules

1. Drafts keyed by product id in a Map (or `useDraft` per row id) — never cleared on collapse.
2. Confirm sheet appears at most once per navigation; "Keep editing" returns exactly where the user was.
3. Counted quantity validates > 0, numeric; reason mandatory (existing rule).
4. The ledger write path is untouched: `writeStockAdjustment` stays the only way stock changes.
5. Performance: rows are cheap (name + number); forms mount only when expanded; the page stays fast with 1,000+ products (existing pagination).

## 6. Boundaries

- **Ask first:** touching `writeStockAdjustment` or the stock-movement types (do NOT — the spec is presentation-only).
- **Never:** a "set stock" direct-edit field (ledger rule); clearing drafts on collapse; blocking navigation with a modal more than once.

## 7. Verification

1. Unit: draft-map behavior (collapse keeps, save clears), guard fires once, validation rules.
2. Manual: 100-product count with random collapse/expand → zero lost edits; airplane-mode count works.
3. Typecheck + `npm test -- stockcount` green.

## 8. Next gates

PLAN → BUILD (TDD on the draft map + guard) → VERIFY (§7) → REVIEW (minimalism: one row, one chevron, one form; the dirty dot is the only new chrome).
