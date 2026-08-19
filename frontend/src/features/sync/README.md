# Sync

Outbox pattern: local writes queue here first, a Workbox-managed Background Sync registration drains the queue in FIFO order on reconnect with client-generated idempotency keys. See `.agents/rules/offline-sync-and-ledger.md`.

## What actually drains the queue

`drain-outbox.ts` is the client-side half: reads pending outbox items FIFO, POSTs them as a batch to the `sync-push` Edge Function (`supabase/functions/sync-push/`), and reconciles the response back into IndexedDB (deletes applied/skipped items, marks server-rejected items `failed` with the error, reverts a plain network failure to `pending` rather than `failed`, a dropped connection is not a rejection). `SyncEngine.tsx` fires it on boot and on the browser's `online` event; it's mounted once in the authenticated app shell (`src/app/(app)/layout.tsx`).

The server-side half is five `sync_apply_*` Postgres functions (migration `20260807081123_sync_apply_functions.sql`), one per `SyncEntityType`, each its own atomic, idempotent transaction. The Edge Function independently re-checks the caller's role and branch scope before calling one, service_role bypasses RLS, so this check is the actual enforcement, not the RLS policies. See `.agents/skills/write-edge-function.md`.

**No-ops until a real session exists.** `drainOutbox()` calls `getSupabase()` (`src/lib/supabase.ts`, lazily constructed, returns `null` if env vars aren't set) and bails if there's no signed-in session. Auth screens use the normal `/login` flow, and `useCurrentUser()` resolves the cached account context for an authenticated device. It still no-ops correctly for a device with no Supabase env configured or no session yet.

**Testing**: `__tests__/sync-apply-functions.test.ts` runs the real merge SQL against a real Postgres engine (`@electric-sql/pglite`, Postgres-to-WASM, not a mock or a hand-rolled reimplementation) and is the mandatory two-device conflict test for this path per `.agents/skills/write-offline-conflict-test.md`. `__tests__/drain-outbox.test.ts` covers the client-side reconciliation logic. Neither the Deno Edge Function nor a full local Supabase stack (Auth/Realtime/PostgREST wiring) has been runtime-verified, this environment has neither the Supabase CLI nor Deno available; that verification is still owed before this goes live, on top of the real-Android-hardware requirement `.agents/rules/testing-and-qa.md` already names.
