# Offline startup recovery — November 2026

## Decision

When local startup exceeds five seconds, the app must stop waiting and offer one active recovery attempt. Recovery closes this tab's Dexie connection, asks other same-origin app tabs to release theirs, performs one bounded reopen, and reruns local routing only after the reopen succeeds. If the lock remains, the app shows explicit close-other-tabs guidance instead of repeating the same retry loop.

## Evidence

- [Dexie `blocked` event documentation](https://dexie.org/docs/Dexie/Dexie.on.blocked): a blocked upgrade has not failed; it resumes only after the blocking connection is released.
- [Dexie `versionchange` documentation](https://dexie.org/docs/Dexie/Dexie.on.versionchange): existing connections must close so another page's upgrade can continue.
- [MDN, Using IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB#version_changes_while_a_web_app_is_open_in_another_tab): all older connections must acknowledge and close before a higher-version open can proceed.
- [IndexedDB 3.0, connection queues](https://www.w3.org/TR/IndexedDB-3/#connection-queues): an open request may remain blocked until other connections close.

## Rejected approaches

| Approach | Reason rejected |
|---|---|
| Repeat the same local read after five seconds | A blocked open is still pending, so this only recreates the loop. |
| Delete or reset IndexedDB | It risks destroying unsynced sales and violates TRUST promises 1 and 7. |
| Redirect immediately to a generic offline page | Connectivity is not necessarily the problem and the action does not release an IndexedDB lock. |
| Retry without bounding the reopen | A blocker can remain indefinitely, recreating the original frozen screen. |

## TRUST evidence

Serves promise 9 (understandable, recoverable interface) without weakening promises 1, 6, or 7. Automated evidence covers successful repair and rerouting, failed repair reaching a terminal instruction state, bounded database recovery, late-open connection cleanup, and existing closed-connection recovery behavior.

## Remaining device verification

Before release, verify on an installed Android PWA with two open app tabs: hold the old connection, launch the new build offline, choose **Repair and continue**, confirm the cooperating tab releases the database, and confirm pending outbox rows remain unchanged. A genuinely frozen or old-code tab cannot be forcibly closed by browser JavaScript; the final state must instruct the operator to close it and reload.
