# SPEC: First-Visit Walkthrough (per-page coach marks)

| | |
|---|---|
| Status | DRAFT for SPEC gate |
| Feature | Master audit row 2k (P1) |
| Evidence | LazyWeb search "app onboarding coach marks tooltip tour" — strong coverage (0.636): Character AI tooltip modal, DuckDuckGo 2/4 tour, Four Seasons overlay, Google Maps contextual tip (2026-08-25) |
| Date | 2026-08-25 |

## 1. DOUBT — why

The user's idea (vetted): when a new user enters a page for the first time, highlight the key components and buttons with their function written above or below each one. This is the proven **coach marks / tooltip tour** pattern (Intercom/Appcues/Pendo style). The app already has GuidedTour (an 8-step first-run spotlight); this extends the idea per-page so every page teaches itself once. Pure client-side, zero network, zero budget impact.

**Verdict:** BUILD, P1.

## 2. Objective

A new user understands each page's key controls in under a minute, without a manual, without blocking.

**Success criteria (measurable):**
- First visit to a page shows 2–4 one-line labels anchored above/below the key elements; subsequent visits show none.
- Every tour is dismissible (X + Skip all) and re-triggerable from Help & Support ("Show me around").
- `prefers-reduced-motion` users get a static outline (no pulse).
- Zero impact on load: marks render after first paint + idle, never before.

## 3. Decisions (best solutions)

1. **Component:** `CoachMarkLayer` (reuse the GuidedTour spotlight mechanics: element lookup by `data-coach="id"`, 4-mask overlay, tooltip card). One layer per page, configured declaratively.
2. **Config per page:** `PAGE_COACH: Record<route, { targetId, label, placement: "above"|"below" }[]>` — 2–4 items max per page. Pages: Home (quick actions, jump search), Sell (search, cart, payment), Inventory (search, add, scan), Contacts (chips, FAB), Close Day (counted cash, variance), Reports (period filter).
3. **Seen flags:** localStorage key per page (`stockpadi-coach-<route>` = "1"); skip-all sets all. Never re-arms (same rule as GuidedTour's dismissed flag).
4. **Sequencing:** one mark at a time; tap Next → next mark; tap the highlighted element → advance and act (the element works normally — marks are non-blocking overlays).
5. **Trigger timing:** after `requestIdleCallback` (or 600ms fallback) on first visit; marks never delay the page.
6. **Reduced motion:** static 2px brand outline; no `animate-pulse` (remove it from GuidedTour too — ban-list cleanup).
7. **Accessibility:** tooltip cards are focusable with real text; ESC dismisses; aria-labels on the layer; the highlighted element keeps its own label.
8. **Copy:** one sentence per mark, plain language, names the action ("Sell — ring up a sale here. Works offline."). No em dashes.

## 4. Module map

| Module | Responsibility |
|---|---|
| `coach-layer` | Overlay, spotlight lookup, tooltip card, Next/Skip, reduced-motion variant |
| `coach-config` | Per-page definitions + seen-flag storage |
| `coach-help` | Help & Support "Show me around" re-trigger (resets flags for one run) |

Build order: `coach-layer` → `coach-config` → `coach-help`. The 8-step GuidedTour is REPLACED by per-page marks + the 1-step Home welcome (activation-onboarding spec §4.3).

## 5. Rules

1. Never more than 4 marks per page; never on the POS mid-checkout (a cashier with a queue doesn't want teaching — marks on POS show only when the cart is empty).
2. Marks never cover the element; the tooltip is above or below per config, flipping to stay on-screen.
3. Seen flags are per device (local), consistent with offline-first.
4. No network, no analytics, no new dependencies.

## 6. Boundaries

- **Ask first:** replacing GuidedTour (approved in principle — this spec's §4; confirm at PLAN).
- **Never:** blocking overlays; marks on every visit; more than 4 marks; motion for reduced-motion users.

## 7. Verification

1. Manual: first visit to each configured page shows its marks once; revisit shows none; Help re-triggers; Skip all clears; airplane mode shows marks normally.
2. Reduced-motion emulation (DevTools): static outlines, no pulse.
3. Typecheck + existing tests green; no new deps in package.json.

## 8. Next gates

PLAN → BUILD (coach-layer first, reusing GuidedTour mechanics) → VERIFY (§7) → REVIEW (minimalism: the layer must be invisible when done — no chrome left behind).
