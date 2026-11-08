# Offline startup recovery — November 2026

## Decision

When local startup exceeds the three-second cold-start ceiling, the app automatically performs one active recovery attempt. Recovery closes this tab's Dexie connection, asks other same-origin app tabs to release theirs, performs one bounded reopen, and reruns local routing only after the reopen succeeds. If the lock remains, the app shows explicit close-other-tabs guidance instead of repeating the same retry loop.

The root document also carries a hydration-independent recovery panel. If the cached HTML loads but its hashed JavaScript does not, an inline watchdog replaces the skeleton with ordinary document links after seven seconds. This path deliberately does not depend on React, Next navigation, IndexedDB, or the network.

Normal offline entry is not a recovery flow. It resolves the same local session and opens the same workspace as online entry; the persistent offline banner communicates connectivity after entry. `OfflineNavigationGuard` allows warmed local routes and intercepts genuinely online-only routes with the existing in-app “This page needs a connection” dialog.

## Executed production evidence

Measured against the production Next.js/Serwist build on 2026-11-08 with an authenticated IndexedDB session:

| Scenario | Result |
|---|---|
| Online `/` to Dashboard | 294 ms |
| Offline `/` to cached Dashboard | 211 ms |
| External Next.js chunks intentionally blocked | Static recovery appeared in 7.226 s instead of leaving the skeleton indefinitely |

These timings are local browser measurements, not target-device field results. Android 10–13 testing on the documented 2–3 GB device class remains required before release.

## Git history finding

| Date | Commit | Change | Effect |
|---|---|---|---|
| 2026-10-09 | `673e6ec` | Root startup returned `null` while local routing ran. | A startup failure looked blank, but there was no persistent skeleton. |
| 2026-10-09 | `022a839` | Added “Loading your local workspace…” as the server-rendered root fallback. | When hydration fails, the loading state remains forever because the timeout logic itself is JavaScript. |
| 2026-10-12 | `8845bfb` | Added build-versioned navigation/static caches, aggressive old-cache deletion, delayed activation, and a larger update coordinator. | Created a document/chunk mismatch risk during worker replacement. |
| 2026-10-17 | `870008e` | Reduced navigation network timeout from three seconds to 0.8 seconds. | Faster cache fallback; not the cause of the missing button. |
| 2026-11-03 | `f54f53a` | Enabled Next's experimental offline support. | Added another routing layer but did not explain a server-rendered skeleton that never hydrates. |
| 2026-11-08 | `33c084d` | Added a React timeout and IndexedDB repair UI. | Correct for a running client, but unable to help when the client bundle itself fails to hydrate. |

The observed symptom—skeleton visible, but no button after the timeout—proves the React recovery state did not execute. The service-worker lifecycle was therefore the primary defect; IndexedDB recovery remains a secondary protection.

## Evidence

- [Dexie `blocked` event documentation](https://dexie.org/docs/Dexie/Dexie.on.blocked): a blocked upgrade has not failed; it resumes only after the blocking connection is released.
- [Dexie `versionchange` documentation](https://dexie.org/docs/Dexie/Dexie.on.versionchange): existing connections must close so another page's upgrade can continue.
- [MDN, Using IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB#version_changes_while_a_web_app_is_open_in_another_tab): all older connections must acknowledge and close before a higher-version open can proceed.
- [IndexedDB 3.0, connection queues](https://www.w3.org/TR/IndexedDB-3/#connection-queues): an open request may remain blocked until other connections close.
- [MDN, replacing a service worker](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers#replacing_an_existing_service_worker): the previous worker normally remains active until its controlled pages close, keeping the old cache available until retirement.
- [Chrome service-worker lifecycle](https://web.dev/service-worker-lifecycle/): `skipWaiting()` can make a new worker control pages loaded by an older version and therefore requires care.
- [Workbox issue 3126](https://github.com/GoogleChrome/workbox/issues/3126): documents existing tabs breaking when activation removes immutable assets that their older document still references.

## Rejected approaches

| Approach | Reason rejected |
|---|---|
| Repeat the same local read after five seconds | A blocked open is still pending, so this only recreates the loop. |
| Delete or reset IndexedDB | It risks destroying unsynced sales and violates TRUST promises 1 and 7. |
| Redirect immediately to a generic offline page | Connectivity is not necessarily the problem and the action does not release an IndexedDB lock. |
| Retry without bounding the reopen | A blocker can remain indefinitely, recreating the original frozen screen. |
| Depend exclusively on a React timeout | It cannot render if the cached client bundle fails to hydrate. |
| Automatically activate every installed worker | It can mix an old document with a new worker and remove chunks the document still needs. |

## TRUST evidence

Serves promise 9 (understandable, recoverable interface) without weakening promises 1, 6, or 7. Automated evidence covers successful repair and rerouting, failed repair reaching a terminal instruction state, bounded database recovery, late-open connection cleanup, and existing closed-connection recovery behavior.

## Remaining device verification

Before release, verify on an installed Android PWA with two open app tabs: hold the old connection, launch the new build offline, choose **Repair and continue**, confirm the cooperating tab releases the database, and confirm pending outbox rows remain unchanged. A genuinely frozen or old-code tab cannot be forcibly closed by browser JavaScript; the final state must instruct the operator to close it and reload.
