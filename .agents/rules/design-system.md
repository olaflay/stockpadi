# Design System — StockPadi

This file names the specific choices for this product. The reasoning behind every rule here lives in `.agents/rules/zero-ai-slop-design.md`, read that first if anything here seems arbitrary, it isn't, it's derived from that skill's product-shape table.

## Lead system: Samsung One UI

This product is a mobile-first PWA for a cost- and data-sensitive market, used mostly one-handed by a cashier who is also holding a phone or handling stock in the other hand. That is exactly the shape One UI is built for. Concretely, this means:

- Every primary screen splits into a top viewing area and a bottom interaction area. Product search, checkout confirmation, and any primary action live in the bottom third of the screen, reachable by thumb without adjusting grip.
- Focus blocks (card containers with a deliberately large corner radius) are used to pull the eye to the one thing that matters on a given screen, the current sale total during checkout, the low-stock count on the dashboard, not applied uniformly to every card as decoration.
- Layout and feature availability adapt to device and screen size, not just CSS breakpoints. A cheap Android phone and a larger tablet used at the owner's desk should each feel like the right tool for that device, not a squeezed or stretched version of the other.

## Borrowed: Meta's data-lite discipline

This product borrows Meta's engineering discipline around accessibility and reach at scale, specifically:

- WCAG AA contrast is a hard requirement on every screen, checked, not eyeballed.
- Every screen must stay usable on a limited data plan and a low-end device. No layout that only works after a fast first paint, no blocking on a heavy asset before the interface becomes usable.
- Tokens for color, type, and spacing are the actual source of truth the code builds from. If a design value only exists in someone's head or a screenshot, it is not implemented yet.

## What this rules out (see the full ban list in zero-ai-slop-design.md)

No purple-to-blue gradient hero. No glassmorphism as decoration. No emoji standing in for real icons, especially for status or action icons in the POS flow where clarity under time pressure matters. No hardcoded hex or pixel values in components, everything comes from a named token.

## The screen-state checklist (non-negotiable per screen)

Every primary screen (Dashboard, Products, POS, Reports) must explicitly handle: empty, loading (skeleton, not a spinner, for anything over 300ms), offline (a persistent, non-blocking banner, never a modal), sync-in-progress, error (plain language plus a retry action, never a raw error code), success (a brief dismissible toast, never a modal that blocks the next action on a high-frequency screen like POS), permission-denied (states which role is required), and no-data-matching-filter as distinct from no-data-exists.

### Zero Dead Ends & Standardized State Cards (Strict Rule)
- **Never trap a user in an empty, error, offline, or zero-inventory state**: Every non-ideal state MUST provide an immediate, unambiguous go-to CTA button (e.g. "Add a product", "Adjust to available stock", "Restock", "Go to Dashboard", or "Resume Selling").
- **State Card Standardization**: All state views (`EmptyState`, `NoResultsState`, `ErrorState`, `PermissionDenied`, and offline pages) share a consistent layout: `max-w-sm` container, 56px tonal icon circle, `title-lg` bold heading, `body` muted description, and standardized primary/secondary action buttons. No ad-hoc disjointed card styles across screens.
- **Cart & Inventory Dead-End Prevention**: If a product has zero stock or requested quantity exceeds available inventory, the POS cart must never crash or throw an unhandled error at checkout. The system must proactively clamp steppers, highlight affected rows, provide 1-tap "Adjust to available" / "Remove" CTAs, and disable checkout with an explanatory alert until resolved.

## Selection states: two intentional idioms, not drift

Two different visual treatments for "this one is selected" both exist on purpose:

- **Chips/segmented controls** (POS category filters, Products filter chips, ThemeToggle) use a solid `bg-brand-accent` fill — these are single-choice pickers where the selected option needs to read instantly at a glance.
- **BottomNav's active tab** uses a light `bg-brand-accent/10` pill behind the icon (M3's Navigation Bar "active indicator") — persistent chrome you look at constantly shouldn't shout as loud as a one-off choice.

Icon color: see `src/components/ui/icon-tone.ts`. Every icon outside BottomNav carries a tone (brand/success/warning/danger/neutral) tied to real meaning, never assigned for variety. Currently wired into SettingsRow and Reports; extend new icon-bearing rows through the same file rather than hardcoding a color.

Tap feedback: `src/components/ui/Ripple.tsx` (`RippleButton`/`RippleLink`) is the default for a tappable card or list row — Settings, Dashboard, Products, Sales, Staff, and POS's product rows use it. A plain `<button>`/`<Link>` for a card is a gap to close, not a second accepted style.

## Before shipping any screen

Run the twelve-point checklist in Section 6 of `zero-ai-slop-design.md`. Name the lead system in the PR description or a code comment. Three or more hits against that skill's ban list means stop and redesign, not polish further.
