---
name: write-edge-function
description: Use this when adding or modifying a Supabase Edge Function, particularly anything handling sync batches, ledger merges, or reporting aggregation.
---

# Writing an Edge Function

## When a new Edge Function is the right tool

Use one for: sync batch processing (applying a device's queued writes), any logic that must run as a single atomic Postgres transaction (a sale that both inserts sale rows and writes stock movements together, all or nothing), and reporting aggregation too heavy to run as a plain PostgREST query. Do not use one for straightforward CRUD that PostgREST's auto-generated API already handles, adding an Edge Function there is unnecessary indirection.

## The transactional requirement

Anything that writes to `stock_movements` alongside another table (a sale writing both `sales`/`sale_items` and the corresponding stock movements) must do so inside a single Postgres transaction. A partial write, sale recorded but stock movement missing, or the reverse, is exactly the kind of silent inconsistency `.agents/rules/offline-sync-and-ledger.md` exists to prevent. If the function can fail partway through, wrap the whole operation in a transaction so a failure rolls back cleanly rather than leaving the ledger and the sales table disagreeing.

## Idempotency

Every sync-batch Edge Function checks the client-generated idempotency key from `.agents/rules/coding-standards-and-api.md` before processing an item, and skips (rather than reprocesses) anything already applied. A retried batch after a dropped connection must be safe to replay in full.

## RLS still applies

An Edge Function running with elevated privileges to perform the merge still needs to independently verify the calling user's role permits the operation being requested, per the matrix in `.agents/rules/database-and-rls.md`. Do not assume the client already checked this, the client is not a trusted boundary, the server-side check is the actual enforcement.

## Testing

Follow `.agents/skills/write-offline-conflict-test.md` for anything touching the ledger. For non-ledger functions, a straightforward integration test against a local Supabase instance covering the success path and at least one failure/rollback path is the bar.
