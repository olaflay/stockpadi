# ADR 0001: Canonical browser-to-database application flow

- Status: accepted
- Date: 2026-10-07
- Scope: frontend business data, offline writes, synchronization, and server authorization

## Decision

The canonical application flow is:

```text
Browser UI
  -> feature application command/read model
  -> Dexie local data layer and durable outbox
  -> same-origin /api transport
  -> Node backend
  -> Supabase Auth verification + request-scoped reads / privileged RPC dispatch
  -> Postgres/RLS/RPCs
```

The Node backend is the only application sync boundary. `POST /api/sync/push`
and `GET /api/sync/pull` are the authoritative push and pull contracts. The
browser never calls PostgREST, a Supabase RPC, or a Supabase Function for
business data.

Supabase Auth is the one browser authentication SDK owner. The browser uses the
Supabase public client for sign-in, sign-out, token refresh, and auth events.
The backend verifies the bearer token, resolves account context, and performs
authorization. The Dexie session and cached user are local rendering/offline
state only; they are never an authorization source.

The foreground `SyncCoordinator` owns sync scheduling, single-flight execution,
outbox retry, push acknowledgement, pull application, and the durable sync
cursor. `SyncEngine.tsx` is only the React lifecycle adapter. Web Locks and an
additive Dexie lease coordinate tabs. Serwist owns app-shell/navigation caching
and can request a coordinator wake-up, but it does not replay mutations and is
not a second sync engine.

Postgres is authoritative when local and server state disagree. Local ledger
events remain durable until the backend acknowledges them, and stock/credit
convergence is confirmed by the pull projection. The database ledger and RLS/RPC
rules decide whether a mutation is accepted.

## Context

The repository contains a Next.js PWA, a separately deployable Node backend, a
shared contracts package, and Supabase migrations/tests. Historical Supabase
Function URLs still exist in `supabase/functions/` for compatibility with
already deployed callers. Those functions proxy to the Node backend and contain
no independent domain, authorization, or sync implementation.

The current code was already close to this decision: browser feature code uses
the Node API for business traffic, `frontend/src/features/sync/SyncCoordinator.ts`
is the sole client coordinator, and `backend/src/modules/sync/` dispatches to
database batch/RPC logic. This ADR makes those boundaries explicit so future
work does not reintroduce the older direct-Supabase model.

## Consequences

- New browser business reads/writes go through
  `frontend/src/platform/api/backend-client.ts`.
- New offline writes update local data and the outbox in one Dexie transaction.
- New sync behavior belongs in `frontend/src/features/sync/`,
  `backend/src/modules/sync/`, shared contracts, and database migrations/RPCs.
- New Supabase Functions require an explicit compatibility or platform reason;
  they cannot become an alternate browser mutation path.
- Realtime is not currently a source of truth or a required sync transport.
  Online/focus/reconnect polling and the cursor pull guarantee catch-up.
- Server authorization remains duplicated deliberately at two trust boundaries:
  backend authorization gives safe API behavior and Postgres RLS/RPCs provide
  the final database enforcement. Neither UI role filtering nor cached local
  context is security.

## Rejected alternatives

1. **Browser -> Supabase PostgREST/RPC for business writes.** Rejected because
   it creates a second mutation and authorization path outside the Node API.
2. **Service-worker Background Sync as the outbox owner.** Rejected because it
   can replay a mutation after the application classified it as blocked,
   conflicted, or awaiting server confirmation.
3. **Moving every folder into a new `app/`, `domain/`, or `infrastructure/`
   taxonomy.** Rejected because the existing feature-oriented structure already
   keeps business behavior close to its tests; only the ambiguous transport
   boundary is being named and migrated.

## Evidence

- Browser transport: `frontend/src/platform/api/backend-client.ts` and
  `frontend/next.config.ts`.
- Auth-only browser Supabase usage: `frontend/src/lib/supabase.ts`.
- Coordinator/outbox owner and retry semantics:
  `frontend/src/features/sync/SyncCoordinator.ts` and
  `frontend/src/features/sync/drain-outbox.ts`.
- Pull application and cursor persistence:
  `frontend/src/features/sync/preload-session-data.ts` and `lib/db.ts`.
- Backend push/pull: `backend/src/modules/sync/`.
- Database acceptance and tenant enforcement: `supabase/migrations/` and
  `supabase/__tests__/`.
- Service-worker scope: `frontend/src/app/sw.ts`.
