# Mobile PWA feasibility and future-proofing review

**Review date:** 2026-11-01  
**Scope:** frontend routes, PWA shell, responsive layout, keyboard and modal behaviour, offline durability, accessibility, performance, and five-year product feasibility.  
**Authority:** evidence record only. Launch scope remains governed by `docs/LAUNCH_SCOPE.md`; accepted work belongs in `docs/ROADMAP-AND-BACKLOG.md`.

## Executive decision

Enter a **reliability, real-device validation, and adoption phase**, not a broad feature phase. The durable position is a trustworthy inventory and sales record that stays useful when connectivity fails—not an all-in-one accounting, payments, CRM, financing, and AI suite.

The previous report's 100/100 scores, 150-test total, and machine-local screenshots are withdrawn. They do not meet the TRUST evidence standard. This review uses four labels:

- **Verified:** current code plus an executed test.
- **Synthetic-only:** useful automation, but not target-hardware proof.
- **Unverified:** plausible or implemented, but missing required evidence.
- **Rejected:** infeasible, unsafe, outside locked scope, or not valuable enough now.

## Current strengths

| Area | Evidence | Grade |
|---|---|---|
| App-like shell | standalone display, safe-area viewport support, keyboard resize hint, and dynamic viewport app shells | Implemented; device validation pending |
| Offline core | Dexie local data, durable outbox, Serwist worker, explicit offline route | Automated evidence; destructive device testing pending |
| Accessible zoom | viewport permits 5× zoom | Verified in configuration |
| Modal foundation | focus trap/restore, Escape/backdrop close, responsive sheet/dialog, reduced-motion path | Component-tested; device matrix pending |
| One-handed navigation | frequent actions and primary mobile navigation near the bottom | Implemented; ergonomic field evidence pending |
| Storage resilience | persistence request/status logic and tests | API behaviour tested; eviction recovery pending |

## P0 — reliability and governance gates

1. **Prove tenant isolation against real PostgreSQL policies.** The current PGlite harness is valuable, but does not meet TRUST Promise 8's real-Postgres evidence bar.
2. **Complete backup and restore proof.** Choose RPO/RTO, run an encrypted off-site backup, restore it, validate schema/functions/RLS and repeat quarterly.
3. **Run the named-device offline survival pilot.** On a real 2 GB Android device, create 50+ offline sales, force-kill at write/sync boundaries, reopen, reconnect on intermittent 2G/3G, and prove no loss/duplication and eventual queue drain.
4. **Resolve governance drift.** The payment rule says single-tenant/no subscriptions while the project is locked as multi-tenant SaaS; the PRD also contains superseded hosting text. Locked documents must describe one architecture.
5. **Label synthetic performance honestly.** Keep the benchmark as a CI regression guard, but do not present Node/Dexie results as physical-device evidence.

## P1 — mobile interaction and accessibility

1. **Remove forced portrait orientation.** Mounted phones, tablets, accessibility rotation and external keyboards need adaptive layouts. One-handed design comes from layout, not an orientation lock.
2. **Generate the manifest through the branding boundary.** `public/manifest.json` hardcodes the brand, description and colors, violating the zero-hardcoding law.
3. **Consolidate keyboard coordination.** `KeyboardScrollHandler`, `NavigationContext`, and `Modal` independently react to focus/viewport changes and can cause delayed scroll thrash. Use one coordinator, cancel pending timers, and scroll only when the active field is occluded.
4. **Finish viewport cleanup.** Error, offline, not-found, admin, and landing surfaces still contain `100vh`/`min-h-screen`. Replace after visual regression checks; retain deliberate legacy fallbacks only where required.
5. **Audit every autofocus.** Product, payment, onboarding, registration callback, and stock-count flows can summon the keyboard. Autofocus only after an explicit typing action or when typing is unquestionably the next task.
6. **Use task-shaped modals.** Sheets are for short, contextual, safely cancelable work. Long, multi-step, financial, deep-linkable, or draft-recoverable work stays a route.
7. **Harden overlay accessibility.** Make the background inert, support nested overlay scroll locks, restore the prior overflow value, and expose swipe dismissal through an operable control or keep the handle decorative.
8. **Remove unnecessary GPU cost.** Avoid core-sheet backdrop blur, global scrollbar hiding, permanent `will-change`, and blurred/infinite skeletons on low-end devices.
9. **Meet the project touch target.** The install banner's 28×28 dismiss control is below the locked 48px One UI target.
10. **Prove reflow and focus visibility.** Test 320 CSS px, 200% zoom, landscape, screen readers, switch/keyboard navigation, and focus not obscured by sticky chrome or the virtual keyboard.

Only 12 `loading.tsx` files exist for 82 page routes. That is an audit queue, not an instruction to add 70 spinners: every route needs an explicit instant, skeleton, or local-first loading decision.

## Native-feeling PWA standard

- Make local actions instant and synchronize visibly later. Stable layout and honest state matter more than elaborate animation.
- Measure P75 mobile LCP ≤2.5 s, INP ≤200 ms, and CLS ≤0.1; also track cached cold start, sale commit/search latency at 5,000 products, outbox age, and crash-free sessions.
- Bound every growing list with indexed search plus pagination/progressive rendering.
- Treat Background Sync as an enhancement only; foreground launch, reconnect, and explicit retry must drain the durable outbox.
- Request persistent storage where supported, show protection status, keep export/restore, and handle eviction honestly. Users can still clear data.
- Use opacity/transform motion, avoid layout animation, respect reduced motion, and never delay the next sale for animation.

## Modal and keyboard rule

| Responsive sheet/modal | Route |
|---|---|
| one decision or a few fields | multi-step workflow |
| contextual and safely cancelable | sale, refund, void, restore, import, reconciliation |
| no draft recovery needed | draft recovery or deep link is valuable |
| fits above a 40–55% keyboard | keyboard would hide context/action |
| opener remains meaningful | standalone task with state/history |

Required behaviour:

- focus the title/container first unless the user explicitly chose text entry;
- trap focus, restore it to the opener, and provide a visible close action;
- keep the active field and primary action visible with dynamic viewport sizing and scroll padding;
- dismiss the keyboard through Done/Search/Next, safe background taps, or dirty-state confirmation;
- allow drag dismissal only from a dedicated handle, only at scroll top, and never discard dirty input silently;
- reduced motion removes travel-heavy animation; use a static scrim instead of backdrop blur.

## Five-year feasible portfolio

### Now: launch and trust

- freeze net-new features until open TRUST gates have owners;
- real-Postgres RLS tests, restore rehearsal, governance repair, and named low-end Android pilot;
- reconcile plan entitlements and enforce them server-side;
- instrument activation/reliability without collecting transaction contents unnecessarily;
- finish visible sync recovery, audit, export, refund/void evidence, and historical-cost integrity.

### Next: after gates pass

- define the authoritative staff/offline identity model, then cashier shifts, denomination count, and close-day reconciliation—never reference the nonexistent proposed `local_users` table;
- pending/accepted interbranch transfers with attributable append-only confirmation events;
- accountant export contract;
- supplier last-price/lead-time and days-of-cover prompts only after data-completeness gates;
- subscription grace period/read-only downgrade, feature flags, and rollback controls.

### Later: experiments with kill criteria

- OCR receiving drafts: ≥95% required-field accuracy on representative documents, mandatory review, no autonomous writes;
- neutral anomaly review only with low false positives—never employee accusations;
- forecasting only with enough clean history and visible confidence;
- consented WhatsApp Business workflows and representative Web Bluetooth pilots;
- loyalty only after core retention and paid demand are proven.

### Reject

- live card/wallet processing under the current PCI boundary;
- arbitrary bank/SMS parsing as payment verification;
- autonomous AI financial writes, generic AI copilot, or computer-vision shelf audit;
- battery/employee surveillance;
- “banker-ready balance sheet” without a complete accounting subledger;
- financing, on-chain history, or credit-origination claims;
- wholesale, multicurrency, or loyalty in launch scope without validated demand;
- modalizing every form or promising “unlimited” without support/performance bounds.

## Evidence gates

### Reliability

- zero lost/duplicated sales across at least 1,000 pilot transactions;
- 100% recovery of acknowledged offline sales after forced termination;
- P95 cached cold launch under 3 seconds on the named 2 GB device;
- 99% of outbox records sync within 5 minutes of stable reconnection;
- no record remains unsynced for 24 hours without an owner-visible reason/action;
- every restore drill meets the chosen RPO/RTO.

### Adoption hypotheses—not promises

- ≥70% add a first product on registration day;
- ≥50% record a first sale within 24 hours;
- median time to first sale under 15 minutes;
- D7 active-shop retention ≥60%, D30 ≥40%;
- assisted onboarding under 30 minutes and support under one ticket per active shop/week after month one.

### Commercial proof

- 10+ paying pilot merchants, a structured interview for every cancellation, and support-inclusive Pro gross margin ≥70%;
- validate limits, price, willingness to pay, and support cost before building billing complexity.

## Research basis

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) and [Orientation guidance](https://www.w3.org/WAI/WCAG22/Understanding/orientation.html)
- [WAI-ARIA modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- [Web App Manifest](https://www.w3.org/TR/appmanifest/)
- [web.dev PWA checklist](https://web.dev/articles/pwa-checklist)
- [web.dev offline data](https://web.dev/learn/pwa/offline-data)
- [MDN Background Sync](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API)
- [Workbox caching strategies](https://developer.chrome.com/docs/workbox/caching-strategies-overview)
- [Core Web Vitals thresholds](https://web.dev/articles/defining-core-web-vitals-thresholds)
- [MDN Visual Viewport](https://developer.mozilla.org/en-US/docs/Web/API/Visual_Viewport_API)
- [NIST SP 800-63B](https://pages.nist.gov/800-63-4/sp800-63b.html)
- [Supabase backups](https://supabase.com/docs/guides/platform/backups) and [PostgreSQL pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html)

## Honest limit

A repository review cannot prove physical ergonomics, storage-eviction survival, assistive-technology behaviour, thermal throttling, or weak-network recovery on target devices. Those require named hardware, browser versions, scripts, and recorded results. Until executed, the correct label is **unverified**, not 100/100.


