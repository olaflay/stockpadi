# November 2026 Master Plan Reconciliation

Source: the supplied OjàPadi Master Product and Implementation Blueprint, audited against `0e60478`. Its findings are point-in-time evidence. This supplement sits alongside the existing research, PRD, launch scope, and architecture decisions.

## Checkout refinements

Blueprint sections 7, 11, and 13 support larger frequent touch targets, clear transfer recording language, and honest offline status. The existing Payment pane now uses its 48 CSS px touch token for tender selection and split-payment removal, a tonal transfer color pair, and clear keyboard focus. Transfer guidance asks merchants to check their bank app. The offline footer describes what happens after a completed sale so it does not announce a save before submission. These changes serve TRUST promises 6 and 9. Manual checks remain open at narrow widths, in both themes, at 200% zoom, and with an on-screen keyboard and TalkBack.

## Reliability findings to verify

### Shared interface polish

The navigation update retains labeled primary destinations and uses a tonal selection indicator. The shared dialog and More sheet use surface contrast and elevation in place of decorative outlines. The reconnect reminder waits for automatic sync and only offers the existing manual action when eligible changes still remain. Dismissing the notice leaves background sync and saved changes alone. Settings now permits route prefetch when the online More sheet is open. These refinements support TRUST promises 6 and 9. Installed-device startup and Settings timing still require measurement. See [Android navigation guidance](https://developer.android.com/develop/ui/compose/components/navigation-bar) and [Material surface roles](https://m3.material.io/styles/color/the-color-system).

An Impeccable-inspired polish pass applies to the shared screen header, modal, state card, and form focus rules. Long titles and recovery text wrap, search and invalid inputs retain visible keyboard focus, forced-colors mode has a system-color outline, and step entrances honor reduced motion. These changes serve TRUST promise 9. Use the existing One UI spacing and semantic tokens when extending them. The [Impeccable polish playbook](https://github.com/pbakaus/impeccable/blob/main/skill/reference/polish.md) informs the component-level approach. Route-by-route Android, zoom, forced-colors, and keyboard checks are still needed.

The follow-up checkout pass also connects the visible Cash tendered label to its input, uses the touch target token for quick-cash and discount presets, and lets the split-payment summary wrap when its text needs more room. This supports TRUST promise 9. Tender and discount calculations retain their existing paths. Browser checks for long currency amounts and narrow or zoomed layouts remain open.

- Reproduce the reported onboarding sample movements and aggregate-versus-branch recount mismatch against the current revision. Any correction to historical stock needs an authorized append-only adjustment. Future changes need branch-aware ledger regression tests.
- Check tenant/user scoping for staff, expense, and stock-count drafts, and test whether live refresh can overwrite dirty product edits. Validate account switch and recovery before changing draft persistence.
- The blueprint's historical CI failure is superseded by the verified successful main workflow run [45847425987](https://github.com/olaflay/stockpadi/actions/runs/45847425987). Hardware, device-loss, and field evidence remain separate release gates.

## Proposals for research

- First-run selling channels, quick product entry, and unknown opening stock need merchant task evidence and a compatibility review before altering onboarding or stock semantics.
- Owner alerts, day close, and unified role-aware navigation need route and permission parity, offline behavior checks, and merchant testing before adoption.
- Social orders, reservations, public storefronts, product sizing, and guest checkout remain gated by launch scope and explicit domain decisions. Unpaid intent, posted sales, and fulfillment must remain distinguishable.
- Payment verification requires an explicit decision against the locked payment-method-as-tag boundary. AI, marketing, and external connectors require their own authorization, privacy, and release evidence. Treat provider and legal proposals as research leads pending primary-source verification.

## Workflow consolidation follow-up

- **Stock:** Keep product browsing, receiving a delivery, and counting stock distinct because they have different outcomes and permissions. Restock history now provides one labeled entry for receiving and a permission-filtered entry for counting. Product import continues to use the same importer from Products or More.
- **Sales and reports:** Sales history retains receipts and filtering with one Reports entry. Reports retains Overview, Sales, and Stock together, including for stores that have yet to record a sale.
- **Settings and guidance:** Keep multi-step staff, branch, backup/restore, and help workflows on their existing routes. Group staff and branches in Settings, share About content across its sheet and legacy link, and remove duplicate settings actions from the drawer. The discoverable walkthrough and help remain available.
- **Other entry points reviewed:** Contacts and Debtors already share a hub with distinct initial filters. Checkout, expenses, and Close day describe different actions and should keep clear, separate entry points. Validate the revised discovery paths in short merchant sessions before further consolidation.
