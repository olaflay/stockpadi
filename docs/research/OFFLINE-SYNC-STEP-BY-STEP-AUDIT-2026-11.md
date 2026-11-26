# Offline/online sync step-by-step audit — 2026-11

## Scope and decision

This audit follows a sale from a cold offline launch through local commit,
outbox upload, server application, authoritative pull, and reconnect recovery.
It also checks multi-tab ownership, retries, updates, storage pressure, tenant
isolation, and user-visible status. The architecture remains the canonical
Dexie outbox → single coordinator → same-origin Node API → Postgres ledger
flow. No direct browser database-write path was introduced.

The change serves TRUST promises 1 (a saved sale stays saved), 2 (stock and
debt remain explainable), 3 (offline behaviour is predictable), 5 (the user
can tell whether work is saved), 6 (reconnect converges), and 9 (the app stays
responsive on weak devices).

## Lifecycle audit

| Step | Evidence checked | Result | Optimization or remaining gate |
|---|---|---|---|
| 1. Cold offline launch | Serwist registration, offline navigation guard, minimum boot-route warming | The app shell can open saved work without waiting forever for network state. First-install warming previously marked itself complete even when no active worker existed. | Fixed: retry warming until the worker is active. Warm only `/dashboard` and `/pos`, after sync becomes idle. Physical Android airplane-mode cold-launch remains a release gate. |
| 2. Session and tenant restore | local session, local business ID, account/branch mirrors | Cached identity is the boundary for local reads and writes. Preflight safety checks also warm the tenant cache before transactional writes. | Keep the preflight check; removing it exposed a reduced-schema/transaction boundary in tests. |
| 3. Catalogue readiness | product/category/branch caches and POS query path | POS reads local Dexie data. Offline preparation runs in the background. | Route prefetch and shell warming are bounded; POS search debounce is 130 ms. Measure catalogue-open time with 5,000 products on target Android hardware. |
| 4. Sale validation | `complete-sale.ts` | Payment totals, quantities, prices, discounts, credit customer, capability, and available stock are checked locally before acceptance. | No online dependency was added. Refunds and voids remain online-only. |
| 5. Atomic local commit | one Dexie transaction across sale, stock movements, credit movement, and outbox | A sale cannot commit without its durable replay record. Stock and customer credit remain append-only movements. | Covered by sale and convergence tests. Do not split this transaction for perceived speed. |
| 6. Queue safety | `sync-safety.ts`, outbox schema | High-risk writes pause only at the documented 24-hour/material threshold or absolute 1,000-row limit; data is never purged. | Fixed: query the status index instead of scanning the whole table; calculate oldest age in one pass; include `needs_review`. A future compound `[businessId+status]` index should be added only with a measured migration plan. |
| 7. Immediate upload scheduling | `enqueue-outbox-write.ts`, coordinator | Online writes wake one canonical coordinator after a short coalescing delay; offline writes remain durable and register only a background-sync hint. | Keep the 35 ms batch window. `navigator.onLine` is treated as a hint, not proof. |
| 8. Multi-tab/process ownership | Web Locks plus durable Dexie lease and heartbeat | Only one upload critical section owns replay. Lost pages can be recovered because server operations are idempotent. | Lease wait is bounded at five seconds. BroadcastChannel shortens handoff. No destructive change required. |
| 9. Outbox selection and ordering | `drain-outbox.ts` | Batches are capped at 25, ordered deterministically, dependency-aware, and isolated so one bad item does not stop unrelated work. | Product dependency recovery stays outside the sale fast lane. Further dependency lookup optimization needs profiling before changing semantics. |
| 10. Network failure and retries | per-item classification, timeout tests, backoff metadata | Missing/partial responses are never treated as success. Retryable failures stay queued; permanent/conflict rows remain reviewable; automatic retries are bounded. | Existing timeout and retry tests pass. Queue details remain out of the cashier flow. |
| 11. Server authorization and idempotency | Node sync controller/service and SQL RPC contract | The server resolves the authenticated account, enforces role/branch capability, accepts at most 100 items, and returns one result per mutation. Immutable events use stable identities. | Client sends 25 to reduce slow-network blast radius. SQL/RLS migration verification remains a deployment gate. |
| 12. Ledger application | batch RPC with per-item fallback | Accepted sales produce server-side immutable sale, stock, and credit records; a dropped response is safe to replay. | No mutable quantity or debt balance was introduced. Two-device convergence tests remain mandatory for ledger changes. |
| 13. Realtime wake-up | sync hints and completed-sale events | Realtime is an optimization only; it cannot become the source of truth. | Durable cursor pull remains recovery authority when publication fails. |
| 14. Sale confirmation pull | sale fast lane and `preloadSessionData` | Upload acknowledgement alone does not retire stock-affecting rows; the local delta stays protected until the authoritative projection is downloaded. | Fixed: every `triggerSync("sale")` now schedules a canonical reconciliation pull, including the direct local-write path that previously bypassed the coordinator listener. |
| 15. Incremental pull | server fixed watermark, per-dataset keyset positions, opaque cursor | Multi-page pulls cannot skip rows created during pagination. The completed cursor advances only after the window finishes. | Contract is sound. Continue load-testing the largest tenant datasets and response sizes. |
| 16. Local apply and cursor commit | staged pull records and apply order | Pages are staged, validated, and applied in dependency order; inventory is last. A failed pull restores the initial cursor rather than claiming convergence. | Application spans entity transactions rather than one giant transaction, which avoids long UI-blocking locks; cursor rollback makes replay safe. |
| 17. Reconnect/lifecycle | online probe, focus/resume/pageshow triggers, two-minute safety reconciliation | Reconnect forces a pull; focus/resume recover missed events; active reconciliation is a safety net. | Single-flight coalesces bursts. Do not add independent page-level sync loops. Measure lifecycle request count in production telemetry before adding more debounce. |
| 18. Status UI | banner and compact traffic-light indicator | Red communicates offline/attention, yellow saving, green online/saved. Technical queue controls are not required for normal sales. | Keep the indicator; support diagnostics can remain behind the existing deep link. |
| 19. App update/process death | safe reload wait, draft persistence, stale-sync recovery | Updates wait for critical work where possible; outbox rows survive reload and stale in-flight rows replay idempotently. | First-install worker activation bug fixed. Test forced process kill during upload on physical Android. |
| 20. Storage pressure | quota boundary and persistence handling | Quota errors do not masquerade as successful saves. Durable business mutations are not silently evicted by app logic. | Validate storage persistence/eviction on Chrome Android and a low-storage device before pilot. |

## Optimizations applied in this pass

1. Reduced eager route work: persistent navigation no longer causes Next.js to
   prefetch every destination, and offline warming pauses while sync is busy.
2. Reduced boot-cache work to the two routes required to start selling.
3. Prevented first-install cache warming from being silently lost before the
   service worker becomes active.
4. Replaced the high-risk write full outbox scan and timestamp sort with an
   indexed status query and a single-pass oldest-row calculation.
5. Counted quarantined `needs_review` rows in the safety policy.
6. Closed the sale fast-lane confirmation gap by scheduling reconciliation at
   the canonical trigger boundary.
7. Increased POS search debounce to 130 ms, inside the project performance
   standard for large catalogues.

## Verification executed

- Focused orchestration/cache/safety suite: 23 tests passed.
- Sale, debtor payment, adjustment, purchase, expense, upload, pull, timeout,
  and confirmation suite: 68 tests passed; three expense tests initially
  exposed the tenant-cache transaction dependency during an attempted
  optimization, so that unsafe optimization was reverted.
- Frontend TypeScript check passed.
- Backend push, authorization, idempotency, and Realtime-hint suite: 16 tests
  passed; backend TypeScript check passed.
- `git diff --check` passed (line-ending warnings only).

The remaining release evidence cannot be manufactured in unit tests: cold
airplane-mode launch, process kill during upload, reconnect on weak cellular,
5,000-product interaction latency, multi-device convergence against the real
deployed database/RLS, and low-storage eviction must be executed on target
Android devices and recorded before pilot approval.
