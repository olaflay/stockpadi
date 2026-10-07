---
name: write-edge-function
description: Use this when adding or modifying a Supabase compatibility function, particularly an adapter that forwards legacy traffic to the Node backend or shared Deno email runtime code.
---

# Writing a Supabase compatibility function

## When a Supabase Function is the right tool

The Node backend is the canonical application and sync boundary. A Supabase
Function may be changed when it is a compatibility adapter for a legacy URL or
when shared Deno-runtime email code must be kept deployable while those
adapters remain live. Do not add a second sync, auth, authorization, or domain
implementation here. New browser traffic belongs on the Node `/api` routes.

Database functions/RPCs remain appropriate for operations that must commit as
one Postgres transaction, such as a sale that inserts sale rows and stock
movements together, or the server-side merge functions called by the Node
backend.

## The transactional requirement

Anything that writes to `stock_movements` alongside another table (a sale writing both `sales`/`sale_items` and the corresponding stock movements) must do so inside a single Postgres transaction. A partial write, sale recorded but stock movement missing, or the reverse, is exactly the kind of silent inconsistency `.agents/rules/offline-sync-and-ledger.md` exists to prevent. If the function can fail partway through, wrap the whole operation in a transaction so a failure rolls back cleanly rather than leaving the ledger and the sales table disagreeing.

## Idempotency

The Node sync service checks the client-generated idempotency key from
`.agents/rules/coding-standards-and-api.md` before processing an item, and the
database merge functions enforce the durable result. A retried batch after a
dropped connection must be safe to replay in full. A compatibility adapter
must forward the request without changing those semantics.

## RLS still applies

The Node backend independently verifies the calling user's role and business
context before invoking privileged database operations, per the matrix in
`.agents/rules/database-and-rls.md`. A compatibility adapter must not bypass
that check or expose a service-role credential to the browser.

## Testing

Follow `.agents/skills/write-offline-conflict-test.md` for anything touching the
ledger. For a compatibility adapter, test forwarding, authentication/error
propagation, and that it does not implement a second business path. For SQL
functions, use the Supabase suite with the success path and at least one
failure/rollback path.
