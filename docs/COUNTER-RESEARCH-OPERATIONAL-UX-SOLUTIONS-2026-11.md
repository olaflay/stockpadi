# Counter-research: operational UX solutions — November 2026

## Purpose

This pass challenged the remedies proposed in
`RESEARCH-POS-UX-AND-OPERATIONS-2026-11.md`. It separated solutions OjàPadi
already has from patterns that would require invention, then subjected the invention to the TRUST
gate and an independent Company OS judge review before implementation.

Priorities were reliability, understandable one-handed operation, and maintainable accessible UI,
in that order.

## Counter-evidence

| Question | Evidence | Finding | Confidence |
| --- | --- | --- | --- |
| Should offline work wait for the server? | [Android offline-first data layer](https://developer.android.com/topic/architecture/data-layer/offline-first) and OjàPadi's transactional outbox tests | No. The local data source remains authoritative for immediate work; writes queue durably. | High |
| Should every feature stay visible on the primary screen? | [NN/g progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) and [mobile secondary-content guidance](https://www.nngroup.com/articles/defer-secondary-content-for-mobile/) | No. Frequent actions stay close; advanced tools remain discoverable but secondary. | High |
| Can a modal change focus when users type? | [W3C modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), [WCAG focus order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html), and [WCAG on-focus behaviour](https://www.w3.org/WAI/WCAG21/Understanding/on-focus.html) | No. Focus order must stay logical and focus alone must not trigger disruptive context changes. | High |
| Should a stock count overwrite quantity? | Odoo/Shopify count-review precedents and OjàPadi's ledger law | No. Show expected, counted, and difference; append only the correcting delta. | High |
| Should save feedback contain a frozen upload claim? | Android offline-first guidance plus OjàPadi's live sync state | No. Upload state can change after the message renders; the global live indicator owns it. | High |

The visual precedent set is preserved in the
[Lazyweb operational UX research](https://www.lazyweb.com/agentic-search/022daf1c-41f1-42f6-aaf7-dd009347137c).
It covers search-first inventory, focused expense entry, scannable payment activity, and
non-blocking network recovery. These are pattern receipts, not screens to copy.

## Existing solutions to standardize

1. **Task-based More surface.** Keep frequent operational actions close and group secondary tools
   by job. The drawer remains compact navigation, not a second competing task dashboard.
2. **Truthful save state.** Reuse `SyncIndicator`, `BannerStrip`, alerts, and sync health for the
   live states “saved on this device”, “uploading”, and “needs attention”. Never infer “uploaded”
   merely from network availability and never expose outbox terminology.
3. **Explainable stock count.** Preserve expected, counted, difference, actor, and append-only
   correction evidence.
4. **Explicit debt semantics.** Preserve purple as a secondary cue, direct “amount owed” wording,
   payment-as-reduction semantics, and a clearly labelled final outstanding balance.
5. **Stable overlays.** Preserve stable modal identity, predictable back/close actions, logical
   focus, and reduced-motion support.

## Invented solution and judge decision

The initial proposal was an “Operational Outcome Receipt” after every stock or money mutation. The
judge marked the cross-product version **REVISE** because it would create a broad regression surface,
duplicate the live sync UI, and risk displaying stale upload state.

The standardized version is a narrow pilot on the existing combined expense/delivery sheet:

- Expense: exact submitted category and amount, followed by “View expenses”; it never implies that
  stock changed.
- Delivery: exact submitted total units and total cost, explicit “Stock increased”, followed by
  “View stock”.
- Both reuse the existing accessible toast and existing routes.
- No new persistence, schema, API, sync protocol, or route is introduced.
- Values come only from the confirmed submission, never an AI value or a later product lookup.

## Judge verdict

| Candidate | Verdict | Constraint |
| --- | --- | --- |
| Task-based More/drawer organization | Pass | Do not let both surfaces become duplicate dashboards. |
| Plain-language record state | Pass with constraint | Derive it from live storage; do not freeze it in outcome messages. |
| Expected/counted/difference stock review | Pass | Quantity remains the sum of append-only movements. |
| Purple debt semantics and shared statement | Pass | Wording must carry meaning without relying on colour. |
| Cross-app operational outcome receipt | Revise | Pilot only on expense/delivery with existing toast and routes. |
| Marketplace, autonomous OCR, automated WhatsApp, generic write AI | Reject for this milestone | Existing roadmap entry gates remain binding. |

## Implemented pilot and evidence

The expense/delivery outcome pilot is implemented in
`frontend/src/features/expenses/outflow-outcome.ts` and used by
`AddExpenseSheet.tsx`.

Executed evidence:

- 13 tests passed across outcome copy, accessible toast action, expense persistence, purchase
  receipt ledger writes, and expense/restock convergence.
- 22 tests passed across More/drawer navigation, modal stability, scanner exit, stock-count
  confirmation, ledger adjustment, and debt statement sharing.
- TypeScript typecheck passed.

This serves TRUST 1, 3, 4, 6, 7, and 9. The refused tradeoff is a larger cross-app success-state
refactor and unvalidated feature expansion; reliability of existing operational paths comes first.
