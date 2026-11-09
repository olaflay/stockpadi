# Offline and sync reliability audit — 2026-11-09

## Decision

Keep the canonical architecture: React/Next.js UI reads and writes Dexie; each local business write and its outbox row commit atomically; one foreground coordinator sends idempotent mutations through the same-origin Node API; PostgreSQL is authoritative; Realtime and Background Sync are wake-up hints only.

Replacing this with a second sync engine would add two authorities and create more failure modes. The next gains come from proving browser behavior, hardening storage and deployment boundaries, and operating the existing protocol with measurable service levels.

Priorities used for this review: **reliability, maintainability, security**. Product scope is frozen. Refunds and voids remain online-only. Stock and customer credit remain append-only ledgers.

## Executive findings

| Area | Result | Evidence in this repository | Required action |
|---|---|---|---|
| Local write safety | Strong | Domain writes commit local state and outbox rows in one Dexie transaction; rollback tests exist | Keep and extend property/fault tests |
| Mutation identity | Strong | Stable mutation/idempotency keys, payload version, server dedupe | Add compatibility fixtures to CI for every supported client payload |
| Concurrency | Strong | Web Locks plus durable Dexie lease; single coordinator | Add real multi-tab browser termination tests |
| Pull correctness | Strong | Fixed-watermark/keyset paging, tenant filters, quarantine and durable cursor state | Add long-run interruption/resume tests against PostgreSQL |
| Conflict handling | Strong for ledgers | Append-only deltas; mutable snapshots have explicit conflicts | Keep CRDTs out of financial ledgers |
| Offline navigation | Improved but not fully proven | App shell, route warming, 800 ms network fallback, guarded navigation, cold-start redirect fix | Add installed-PWA browser/device matrix; unit tests are not enough |
| Storage durability | Partial | Persistence request, estimates, quota detection, export/restore | Monitor pressure; test eviction; never delete current app shell during recovery |
| Observability | Partial | Durable safe diagnostics, session/batch IDs, queue age and last outcomes | Export aggregate signals and alert on age/failure, without payloads or customer data |
| Disaster recovery | Open launch gate | Local export/restore exists; hosted migrations verified | Choose RPO/RTO and rehearse a production-format restore quarterly |
| Browser fault testing | Missing | Playwright installed but no E2E/spec files | Build deterministic offline/reload/tab-kill/update/quota suite |
| Security headers | Partial, improved in this audit | Basic browser security headers now applied | Design and stage a nonce-based CSP; test OAuth/email flows before enforcement |
| Operational response | Missing | Vercel rollback exists, but no repository incident runbook | Add owner, severity, rollback and data-reconciliation steps before pilot |

## What the research says

### 1. Offline readiness is an explicit state, not `navigator.onLine`

`navigator.onLine` is only a hint. A trustworthy app distinguishes:

1. **shell ready** — current document and chunks are cached;
2. **business data ready** — the signed-in tenant has a usable local snapshot;
3. **write safe** — IndexedDB is open and a local transaction can commit;
4. **cloud current** — the last complete pull succeeded;
5. **changes pending** — local commits exist but are not yet acknowledged.

The app already represents most of these internally, but the installed-browser/device test is missing. Service workers do not control the initial page immediately, can be terminated between events, and may wait behind an older worker. Therefore a worker registration test is not proof of offline cold start.

### 2. Cache Storage and IndexedDB are separate responsibilities

Cache Storage should hold URL-addressed shell resources; IndexedDB should hold structured tenant data and the durable outbox. API and authenticated business responses must not enter Cache Storage. Browser storage is best-effort by default; an origin can request persistence, but the user can always clear it. Quota failures must be caught and surfaced.

This audit found and fixed a contradiction: emergency quota cleanup matched `navigation` and `precache`, so it could delete the current offline shell while trying to protect IndexedDB. Cleanup now removes only obsolete, app-owned runtime generations. The active worker remains the sole owner of precache lifecycle.

### 3. Background facilities are hints, never correctness dependencies

Background Sync is not uniformly available and delivery timing belongs to the browser. Realtime can disconnect, has plan/throughput limits, and Postgres Changes performs per-subscriber authorization work. Neither is a lossless business-event bus for this product.

Correctness therefore remains:

`local transaction -> durable outbox -> foreground coordinator -> idempotent API -> PostgreSQL -> cursor pull`

Background Sync, online/focus events, and Realtime only shorten the time until that loop runs.

### 4. At-least-once delivery requires idempotency everywhere

Retries can duplicate requests; even PostgreSQL logical decoding can replay changes after a crash. A reliable protocol uses stable mutation IDs, idempotent consumers, ordered dependencies where needed, and never treats a lost response as proof of failure. The repository already follows this principle. Email, alert fan-out, and future external notifications should use a **server transactional outbox** committed with the authoritative database change, then delivered at least once by an idempotent worker.

### 5. Retry policy is load control

Use bounded timeouts, capped exponential backoff, and jitter. Retry network errors, timeouts, 429, and 5xx. Do not automatically retry validation, authorization, or causal conflicts. Park exhausted items for visible review; never discard them. OjàPadi already classifies these states and adds jitter. The next improvement is operational alerting on oldest queue age, not more retry loops.

### 6. Realtime is invalidation, not the source of truth

Supabase currently recommends Broadcast over Postgres Changes for scalability. Postgres Changes is single-threaded for ordering and every event may require subscriber authorization. Keep current cursor pull as truth and treat any realtime message as “data may have changed.” Do not apply financial mutations directly from a socket payload.

### 7. Recovery must be rehearsed, not documented as an intention

Daily database backup, merchant export, and browser local backup solve different failures. Supabase database backups do not include deleted Storage objects. A restore replaces state and creates downtime; a safe drill restores into a separate project first. Launch needs named RPO/RTO, off-site retention, quarterly restore evidence, RLS/function verification, and a reconciliation plan for device outboxes created after the restore point.

## Codebase comparison and strategic backlog

### P0 — before a shop pilot

1. **Browser fault lab.** Add Playwright projects for Chromium desktop and Android-sized Chromium. Cover install/first control, cached cold start, in-app offline navigation, offline sale then process kill, reconnect, duplicate request, response loss after server commit, two tabs, worker update, and IndexedDB version blocking. Run a smaller smoke set in CI; run the full matrix nightly/on release.
2. **Physical device gate.** Test an installed PWA on the named low-end Android model under real radio loss and OS process termination. Record app/build/browser/device versions and video or logs. DevTools throttling cannot close this gate.
3. **Restore rehearsal.** Choose RPO/RTO, restore a production-format backup into an isolated project, verify migrations, functions, RLS, counts, ledger invariants and login, then destroy the rehearsal project. Record elapsed time and data-loss window.
4. **Operational alerts.** Alert only on actionable thresholds: oldest pending mutation age, repeated push/pull failure, client upgrade rejection, cursor reset, quarantine growth, no device contact, storage below safety margin, and restore/backup failure. Never emit customer names, phones, sale lines, tokens or payloads.
5. **Correct launch documentation.** “Unit verified” must not be presented as “installed PWA verified.” `docs/LAUNCH_SCOPE.md` should mark offline operation partial until browser and device evidence exists.

### P1 — reliability hardening

1. Add deterministic failure injection around the API client: timeout before send, disconnect during body, response loss after commit, 429 with `Retry-After`, 5xx burst, corrupt response, stale client 426, and auth expiry.
2. Add protocol fixture tests: every supported payload version must parse in the current server; a previous client fixture must drain without mutation-ID changes; destructive local migrations are prohibited.
3. Add storage-pressure thresholds to Sync Health using the existing estimate. Warn before writes fail; provide export guidance. Do not promise persistence when the browser denies it.
4. Add server-side transactional outbox for approval/welcome email and future alert delivery. Record event ID, kind, tenant, creation time, attempts, next attempt, delivered time and terminal error. Keep recipient data protected; make sends idempotent.
5. Add structured server logs with request ID, sync session ID, batch ID, client version, duration, item counts, result counts and stable error codes. Redact payloads and credentials. Configure retention/alerts only after measuring volume and cost.
6. Add an incident runbook: severity, decision owner, Vercel rollback, worker/cache compatibility check, database rollback prohibition, restore path, customer communication, and post-incident reconciliation.

### P2 — scale after evidence

1. Benchmark pull, push and IndexedDB queries at 5k/25k products and large movement ledgers on target hardware.
2. If Realtime becomes a bottleneck, move wake-up hints to private Broadcast channels; the cursor pull remains unchanged.
3. Evaluate a hosted sync engine only with a time-boxed duplicate app and invariant suite. PowerSync is the closest architectural comparison because it separates local SQLite sync from custom backend uploads. Electric is a read-path sync engine and is not a drop-in mutation/outbox replacement. Dexie Cloud is a useful consistency reference but would replace locked infrastructure. No migration is justified today.

## Tools decision

| Tool/practice | Decision | Reason |
|---|---|---|
| Dexie + Serwist | Keep | Fits current app; failure was lifecycle/readiness proof, not absence of a library |
| Playwright | Adopt fully | Already installed; can control offline browser contexts and service workers |
| Existing Vitest/PGlite suites | Keep and extend | Fast deterministic ledger, RLS and protocol tests |
| Fault proxy such as Toxiproxy | Pilot in CI/local lab | Useful for latency, reset and timeout tests; app-level response-loss injection is still required |
| Vercel structured logs/drains | Stage | Native platform fit; retention and paid-drain cost must be accepted |
| Supabase logs/reports | Use | First-party DB/Auth/Realtime evidence; define alert thresholds |
| Sentry browser SDK | Optional narrow pilot | Useful for crashes; offline delivery exists, but privacy/redaction and cost must pass review |
| OpenTelemetry | Backend-first later | Valuable when request correlation exceeds native logs; browser telemetry can add weight and privacy risk |
| PowerSync | Research pilot only | Strong comparison, but migration creates cost and architecture change without current proof |
| Electric | Do not adopt for writes | Read sync does not replace the authoritative mutation path |
| CRDT framework | Reject for ledgers | Stock, payments and debt need attributable immutable events, not arbitrary merge semantics |

## Measures and service objectives

Collect aggregates by environment/build, not business payload:

- offline cold-start success rate and time to usable local screen;
- service-worker controlled rate and route-cache readiness;
- local transaction failure and quota-exceeded rate;
- pending count and p50/p95 oldest mutation age;
- push/pull success, duration, retries and stable error code;
- acknowledged-but-unconfirmed age;
- cursor restart/reset and quarantine counts;
- client-version rejection count;
- backup success, restore-drill duration, achieved RPO and RTO.

Initial pilot targets should be treated as hypotheses until device evidence exists: zero lost acknowledged ledger events; 100% duplicate-request idempotency; 100% invariant preservation in fault tests; no indefinite loading state; every failed refresh remains usable with an honest stale/offline status.

## Product decisions confirmed 2026-11-09

- The guaranteed offline surface is the till core only: dashboard, POS, product lookup, sale history/detail, debtors, close day, reports, export/recovery and sync health.
- Preparation starts immediately after authenticated entry and stays non-blocking while online. Offline selling is promised only after the device has a local session, branch, catalog and shell.
- One trading day (24 hours) is the normal offline window. This is an operational freshness boundary, not a destructive expiry; local records never disappear at 24 hours.
- The policy raises an owner-assisted save requirement when 100 or more material changes are still pending after 24 hours, or immediately at the absolute 1,000-mutation circuit breaker.
- Diagnostics remain privacy-limited and recovery-first. A pending outbox is preserved through support, update and restore work.
- Reliability remains infrastructure, with one deliberately visible contract: red offline, yellow while saving, and green online/settled in the banner and compact header indicator. Queue counts, preparation controls and technical detail remain outside the cashier flow; exceptional risk gets one clear recovery action.

## Security review

Findings:

- **Resolved:** quota recovery could delete current offline caches.
- **Improved:** global `nosniff`, frame denial, strict referrer policy, limited browser permissions and HSTS headers are now configured.
- **Open:** no enforced CSP. Implement nonce-based CSP in report-only/staging first because Next.js chunks, Supabase auth, OAuth redirects and PWA resources must be proven. A rushed CSP can break the till.
- **Open:** Cache API contents need an automated assertion that `/api`, `/sync`, tokens and authenticated JSON are never stored.
- **Open:** support exports must continue excluding payloads, names, phones, tokens and credentials.

No finding in this review justifies encrypting IndexedDB with a key stored in the same JavaScript origin; that does not defend against XSS. Prioritize CSP, dependency hygiene, session security, device lock guidance and minimal retained data.

## Cross-department challenge log

- **Security objection:** aggressive cache cleanup risks availability and a malicious script can read offline business data. Resolution: preserve current shell/precache; add headers; CSP remains a named gate.
- **QA objection:** existing unit tests cannot prove browser control, process termination or installed-PWA behavior. Resolution: offline status remains partial pending browser/device evidence.
- **DevOps objection:** deployment rollback cannot undo a destructive database migration or reconcile device writes after restore. Resolution: additive migrations remain mandatory; restore drill includes outbox reconciliation.
- **Product objection:** replacing the sync stack would delay reliability work without merchant evidence. Resolution: retain architecture and time-box any vendor comparison outside launch.
- **Accessibility/design objection:** offline failures must keep the last usable screen and provide one clear action instead of a browser error or endless skeleton. The current navigation guard follows this; device verification remains open.

## Evidence executed in this audit

- Frontend storage/service-worker readiness tests: 3 files, 16 tests passed.
- Frontend TypeScript typecheck passed.
- Repository scan found 136 frontend, 22 backend and 13 Supabase test/spec files, but no Playwright config or E2E spec.
- Direct browser database business writes were not found; frontend Supabase use remains in the auth boundary.
- Production build is currently blocked by unrelated in-progress AI-contract work (`packages/contracts/src/index.ts` imports missing `./ai.js` in the current dirty worktree); this audit did not overwrite that work.

## Primary sources

All architecture/security decisions below use official vendor or standards documentation. Claims affecting architecture are corroborated across multiple sources.

1. [MDN: Storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
2. [web.dev: Offline data](https://web.dev/learn/pwa/offline-data)
3. [web.dev: Assets and data](https://web.dev/learn/pwa/assets-and-data)
4. [web.dev: Storage for the web](https://web.dev/articles/storage-for-the-web)
5. [web.dev: Handling navigation requests](https://web.dev/articles/handling-navigation-requests)
6. [web.dev: PWA caching](https://web.dev/learn/pwa/caching)
7. [Chrome: Service worker lifecycle](https://developer.chrome.com/docs/workbox/service-worker-lifecycle)
8. [Chrome: Service worker deployment](https://developer.chrome.com/docs/workbox/service-worker-deployment)
9. [Chrome: Precaching dos and don'ts](https://developer.chrome.com/docs/workbox/precaching-dos-and-donts)
10. [Chrome: Workbox Background Sync](https://developer.chrome.com/docs/workbox/modules/workbox-background-sync)
11. [Chrome: Navigation preload](https://developer.chrome.com/docs/workbox/navigation-preload)
12. [Dexie Cloud consistency model](https://dexie.org/docs/cloud/consistency)
13. [PostgreSQL: Logical decoding concepts](https://www.postgresql.org/docs/current/logicaldecoding-explanation.html)
14. [AWS: Transactional outbox pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)
15. [AWS Builders' Library: Timeouts, retries and backoff with jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)
16. [Microsoft: Transactional outbox](https://learn.microsoft.com/en-us/power-platform/architecture/reference-architectures/transactional-outbox-pattern)
17. [Supabase: Subscribing to database changes](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)
18. [Supabase: Realtime benchmarks](https://supabase.com/docs/guides/realtime/benchmarks)
19. [Supabase: Realtime limits](https://supabase.com/docs/guides/realtime/limits)
20. [Supabase: Database backups](https://supabase.com/docs/guides/platform/backups)
21. [Supabase: Database testing](https://supabase.com/docs/guides/database/testing)
22. [Supabase: Log drains](https://supabase.com/docs/guides/observability/log-drains)
23. [Vercel: Production checklist](https://vercel.com/docs/production-checklist)
24. [Vercel: Structured application logs](https://vercel.com/kb/guide/add-structured-application-logs-to-vercel-functions)
25. [Vercel: Roll back a production deployment](https://vercel.com/docs/deployments/rollback-production-deployment)
26. [OWASP: HTML5 Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html)
27. [Playwright: Service workers](https://playwright.dev/docs/service-workers)
28. [Playwright: BrowserContext.setOffline](https://playwright.dev/docs/api/class-browsercontext#browser-context-set-offline)
29. [OpenTelemetry JavaScript](https://opentelemetry.io/docs/languages/js/)
30. [Jepsen consistency models](https://jepsen.io/consistency/models)

## Rerun inputs

Re-audit after any change to Dexie schema, service-worker lifecycle, sync payload version, coordinator ownership, Supabase Realtime mode, hosting plan, backup plan, or supported browser/device list. Re-run the browser/device fault matrix for every release candidate and the restore drill quarterly.
