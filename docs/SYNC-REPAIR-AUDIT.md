# Sync repair audit

Audit date: 2026-10-07. This document records the implementation evidence
behind the sync changes. It does not describe a hypothetical transport.

## Actual lifecycle on main

```text
local feature command
  -> Dexie transaction: domain row + outbox row
  -> SyncCoordinator trigger / enqueue hint
  -> Web Lock or Dexie sync lease
  -> account-context refresh + Supabase Auth session/token
  -> same-origin POST /api/sync/push
  -> Node bearer authentication
  -> server account/business/worker capability/branch authorization
  -> sync_apply_batch() with per-item savepoint isolation
  -> entity RPC + database unique client_id/idempotency constraints
  -> durable database commit
  -> one result per submitted operation
  -> local outbox acknowledgement or retry/permanent-failure state
  -> cursor GET /api/sync/pull
  -> stage all pages, apply local records idempotently
  -> persist cursor only after apply completes
  -> UI derives Saved on this device / Syncing / Synced / Needs attention
```

Postgres/RLS/RPCs decide whether an operation is accepted. IndexedDB is the
durable working store and outbox, not the authority when state conflicts.
Realtime is not an active business transport in this repository; the installed
Serwist worker can only wake a client. Both paths converge through the same
coordinator.

## Reproduced defects

| Area | Evidence in previous implementation | Repair |
|---|---|---|
| Liveness | `SyncEngine` and `preloadSessionData` returned before making a request when `navigator.onLine` was false. | Removed the hard gate; online status is now a hint and actual transport determines retryability. Regression test covers a reachable backend with a stale offline hint. |
| Cross-tab safety | `recoverStuckSyncingItems` reset every non-confirming `syncing` row, including a row another tab had just marked before its request completed. | Recovery is age-based; coordinator ownership uses Web Locks with a durable Dexie lease fallback. |
| HTTP result safety | A 2xx body without an array of per-operation results could throw after rows were marked `syncing`. | Malformed responses are classified as `MISSING_RESULT` and rows remain retryable. |
| Retry coverage | HTTP 408 was not included in retryable status handling; delay had no jitter. | 408/429/5xx are retryable and persisted exponential backoff includes bounded jitter. |
| Device observability | Push requests sent `device_id: null`. | The durable local session device ID is sent and support-safe session/batch diagnostics are persisted. |
| Service worker ownership | No replay path existed, but there was also no explicit background-sync wake-up integration. | `sync` posts a coordinator message only; the worker never sends a business mutation. |
| Empty pull | A valid empty page produced `fullySynced: false` because the result required at least one entity record. | Empty cursor pages now count as successful convergence. |

## Verified invariants

- Offline feature writes commit the local row and outbox in one Dexie
  transaction.
- Outbox operation IDs are client-generated and stable across retries.
- Sales and ledger movement rows use database uniqueness plus existing
  `sync_apply_*` idempotency checks; replay returns `skipped` rather than
  creating a second event.
- One bad item does not abort valid siblings in `sync_apply_batch`.
- A lost response leaves the local operation retryable; acknowledgement is
  only persisted after the server response, and a replay is idempotent.
- Permanent authorization/validation/conflict outcomes remain visible as
  `failed`, `blocked`, or `conflict`; they are not silently deleted.
- Pull pages are staged and the cursor is not advanced when validation or
  local application fails.
- Pending local entities are protected from remote pull overwrite according to
  the existing entity rules; sales are never deleted because a page omits them.
- Backend account context, worker capabilities, branch assignment, RLS, and
  tenant filters remain authoritative for push and pull.

## Known protocol choices

The existing pull protocol uses an opaque server-time watermark with stable
per-dataset keyset positions. It never uses a client clock for ordering. The
server returns a bounded snapshot watermark, and the client advances its
completed cursor only after local application. Introducing a new global change
sequence would be a separate migration and is not required to repair the
observed failure points.

## Debug procedure

The Sync Health support details and
`getSyncDebugSnapshot()` answer, without exposing payloads or credentials:

1. the oldest pending operation and its stable operation ID;
2. attempt count, last classified error, and next retry time;
3. last server response classification and HTTP status;
4. coordinator phase, sync session ID, batch ID, cursor, and last completed
   pull time.

No IndexedDB database, outbox row, production record, or historical migration
was reset or deleted during this repair.
