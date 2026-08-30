# SPEC: Units Model (carton / pack / piece)

| | |
|---|---|
| Status | DRAFT for SPEC gate |
| Feature | Master audit row 1 (P0) |
| Date | 2026-08-25 |

## 1. DOUBT — why this, why now

**The evidence:** the most-endorsed functional complaint in the entire research set — "sell a single product as wholesale or retail while using the same inventory stock. If 10 trays of eggs are in stock, sales of individual eggs and whole trays should deduct from the same inventory" (Zobaze review, Grade A, R&P §1.1-D). Carton/pack/piece, tray/egg, bag/mudu is how Nigerian retail actually works; almost no app models it. `Product.unitId` already exists in the schema and nothing reads it — the model was planned and never wired.

**Verdict:** BUILD, P0. It is a schema change, so it must happen before production data exists (same reasoning as split payments).

## 2. Objective

Sell a product in more than one unit, all deducting from ONE stock pool, with no arithmetic errors and no separate stock entries.

**Success criteria (measurable):**
- A tray/egg product with 10 trays (12 per tray) in stock sells 1 tray + 2 eggs → stock shows 8 trays + 10 eggs (base units consistent), ledger never drifts.
- Checkout shows a per-line unit chip (Piece / Carton); switching units recalculates price instantly.
- No migration path that can corrupt existing stock (existing products default to unit=piece, factor=1).

## 3. Assumptions

1. One stock pool in **base units** (the smallest sellable unit, usually piece). All `stock_movements` stay in base units; unit is a display/sale-layer concept only. Ledger integrity untouched.
2. Two new product fields: `sellUnit` (label, e.g. "Piece", "Carton", "Bag") and `piecesPerUnit` (integer ≥ 1, default 1). The existing `unitId` field is retired (replaced by this simpler pair).
3. A product can have **two sell units**: its base unit (piece) and one pack unit (carton/bag/crate) with a conversion factor. No arbitrary multi-unit trees (a tree is the trap; two is enough for 99% of retail).
4. Wholesale pricing (row 5, P1) interacts: the wholesale price is per pack unit. This spec defines the units; the wholesale spec consumes them.

## 4. Module map

| Module | Responsibility |
|---|---|
| `units-schema` | Migration: add `sellUnit`, `piecesPerUnit` to products; retire `unitId` usage |
| `units-checkout` | Unit chip per cart line; price = qty × unit price; stock movement converts to base units |
| `units-inventory` | Display stock as "8 trays + 10 eggs"; stock-count page counts in the chosen unit |

Build order: `units-schema` → `units-checkout` → `units-inventory`.

## 5. Rules (the behavior contract)

1. **Movement math:** every sale writes base units. Selling 1 tray (factor 12) writes −12. Selling 2 eggs writes −2. The ledger only ever sees base units.
2. **Stock floor:** a sale cannot take stock below zero in any unit (existing guard stays; now applied after conversion).
3. **Unit chip:** per cart line, a chip toggles Piece ↔ Pack. Default = the product's default sell unit. Switching recalculates the line total instantly; quantity input is in the selected unit.
4. **Display:** inventory and stock-count show "X trays + Y pieces" when both are non-zero, else the single unit ("106 pieces" or "8 trays").
5. **Defaults:** existing products migrate with `sellUnit="Piece"`, `piecesPerUnit=1` — zero behavior change until an owner sets a factor.
6. **Cost price:** cost is per base unit; pack price = base × factor (or an explicit pack sell price if wholesale row 5 is present).

## 6. Data & boundaries

- **Ask first (the migration is the gate):** Dexie schema version bump + `frontend/src/lib/db.ts` product table update; sync schema (`types/sync.ts`) must carry the two new fields; server-side RLS unaffected (no new tables).
- **Never:** store a separate "tray stock" counter; allow fractional pieces per unit; auto-migrate with guesses (always default piece/factor 1).

## 7. Verification

1. Unit tests: conversion math (sell tray + pieces), floor guard, display formatting.
2. Manual: the 10-tray/egg scenario end to end, offline and after sync.
3. Typecheck + `npm test -- units` green; migration runs clean on a copy of existing data (defaults applied, no drift).

## 8. Next gates

PLAN (task split: schema → checkout chip → inventory display) → BUILD (TDD on conversion math) → VERIFY (§7) → REVIEW (minimalism: one chip, one factor — no unit trees, no unit settings screens).
