# SPEC: Hub Dashboard + Nav Re-map + Strategic Search + Role Landing

| | |
|---|---|
| Status | DRAFT for SPEC gate |
| Features | Master audit rows 2c, 2d, 2e, 2i (all P1, one cluster) |
| Date | 2026-08-25 |

## 1. DOUBT — why

The BottomNav component is M3-correct (5 tabs, role-filtered, prefetched) but the map is wrong: 17 features squeeze through 5 tabs, Reports/Settings are catch-alls, "Products" is mislabeled, and the dashboard is a stat wall, not a launchpad. User complaints confirm navigation friction ("I have to get used to tapping back... not the back button" — R&P §1.1-I). The linking doctrine (§2.6): no daily task should require hunting.

**Verdict:** BUILD, P1. No new component — a re-map plus a hub.

## 2. Objective

One tap reaches every daily tool; no screen requires Settings for a daily task; every role sees only its own screens.

**Success criteria (measurable):**
- Every daily task (sell, add product, close day, remind debtor, count stock) reachable in ≤ 2 taps from Home.
- WORKER lands on Sell and never sees management rows.
- Search exists exactly where the job is finding (Home, POS, Inventory) and nowhere else.
- No new network calls: hub renders from Dexie.

## 3. Decisions (best solutions, no open questions)

1. **Tab map:** Home (was Dashboard) · Sell · Inventory (was Products) · Reports · Settings. Labels updated; hrefs unchanged (`/pos`, `/products` keep working; Home keeps `/dashboard`).
2. **Home = command center:** 4 quick-action cards (New sale → `/pos`, Add product → add-sheet, Close day → `/close-day`, New credit → POS credit flow) + "Who owes you" debtor card (row 3, deep-link → Contacts?debtors) + alerts banner (row 7) + low-stock card (tap → Inventory filtered) + the existing hero numbers (today's sales, drawer).
3. **Feature linking:** every report number taps into its list; product page gets "Count stock" + "Add purchase" prefills; sale detail gets Reprint / Remind / Repeat; Home cards jump INTO flows. Nothing dead-ends.
4. **Role landing:** WORKER → `/pos` on login (and the only tabs: Sell, Inventory, Profile). OWNER/ADMIN → Home. Route guards unchanged; only the landing + tab visibility change.
5. **Strategic search (final):** one jump-search field at the top of Home — products (tap → open or add to cart), customers (tap → Contacts detail), screens (tap → jump). POS search + Inventory filter already exist. Nowhere else. All Dexie-local, debounced 120ms.
6. **Home stays light:** hero numbers computed from existing ledger queries; no charts on Home (charts live in Reports, lazy-loaded).

## 4. Module map

| Module | Responsibility |
|---|---|
| `nav-map` | Tab labels, role landing, WORKER tab set |
| `hub-home` | Home rebuild: quick actions, debtor card slot, alerts slot, low stock, jump-search |
| `feature-links` | Drill-downs: report numbers, product → count/purchase, sale → reprint/remind |

Build order: `nav-map` → `hub-home` → `feature-links` (links consume rows 3/7/9 once they land).

## 5. Rules

1. Prefetch stays limited to the 5 tabs (performance doctrine §2.7.3).
2. Quick-action cards: one emerald primary per card, ghost icons elsewhere; 2×2 grid, 44px+ targets.
3. Search results grouped (Products / Contacts / Screens) with a "Go to" affordance; empty results → NoResultsState.
4. Low-stock card and alerts banner are quiet (tonal, not danger); tapping drills into filtered lists.
5. WORKER's Home is NOT hidden — it shows Sell-focused quick actions (New sale, Add product) without management cards. (Better than hiding: the hub adapts per role.)
6. All copy plain language; numbers whole-naira (`₦1.2M` compact on hero).

## 6. Boundaries

- **Ask first:** renaming routes (do NOT — hrefs stay); touching BottomNav behavior for existing roles.
- **Never:** a 6th tab; search on Reports/Settings/Sales; charts on Home; hiding WORKER Home entirely.

## 7. Verification

1. Manual: the ≤2-taps audit for every daily task; WORKER login lands on Sell with 2 tabs + Profile.
2. Jump-search finds a product, a customer, and a screen; results render offline.
3. Every Home card lands in the right flow; report numbers drill down; no dead ends (walk every route).
4. Typecheck + existing tests green.

## 8. Next gates

PLAN (nav-map → hub-home → feature-links) → BUILD → VERIFY (§7) → REVIEW (minimalism: the hub must not become a menu wall; 4 cards, one search, one debtor card).
