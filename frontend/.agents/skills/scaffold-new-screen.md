---
name: scaffold-new-screen
description: Use this when building any new primary screen in StockPadi (Dashboard, Products, POS, Reports, or any future addition), to make sure it ships with every required state and follows the locked design system rather than defaulting to generic layout.
---

# Scaffolding a New Screen

## Before writing any component code

Read `.agents/rules/design-system.md`. Confirm which part of the screen is primary interaction (goes in the bottom third, thumb reach) versus viewing (goes in the top). If the screen is checkout, adjustment, or any action a cashier repeats often during a shift, this placement decision matters more than visual polish.

## Required states, build all of them, not just the happy path

1. **Empty.** First-run guidance with one clear action, never a blank screen with no explanation.
2. **Loading.** A skeleton matching the eventual layout, not a generic spinner, for anything that could take over 300ms.
3. **Offline.** A persistent, non-blocking banner. Never a modal, never something that interrupts the task the person is mid-way through.
4. **Sync in progress.** A small, unobtrusive indicator, disappears automatically on completion.
5. **Error.** Plain language, a retry action, never a raw error code or stack trace surfaced to the user.
6. **Success.** A brief, dismissible toast for high-frequency actions (completing a sale). Do not use a modal that requires a tap to dismiss on anything the cashier does dozens of times a shift.
7. **Permission-denied.** States which role is required and, where useful, who to ask, not a bare "Access denied."
8. **No-data-matching-filter**, distinct from no-data-exists. A filtered product search returning zero results is a different message than a business with no products yet.

## Data source

Every screen reads from IndexedDB first (Dexie.js) and renders from cache immediately, refreshing as fresher data arrives from a sync. Never block the initial render on a network round trip, that defeats the entire offline-first premise of this product.

## Before marking the screen done

Run the twelve-point checklist in `.agents/rules/zero-ai-slop-design.md` Section 6. Confirm every one of the eight states above actually exists and has been triggered manually at least once, not just written and assumed to work.
