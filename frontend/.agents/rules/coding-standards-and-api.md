# Coding Standards and API Conventions

## TypeScript

Strict mode, everywhere, no exceptions carved out for "quick" code. No `any` used as a shortcut past a type error, if the type is genuinely unknown at that point, model it as `unknown` and narrow it properly. Shared types for anything crossing the client/server boundary (a sale payload, a sync batch, a stock movement) live in one place, not redefined separately on each side.

## File structure

Feature-oriented, not type-oriented. Group by what the code does (`pos/`, `inventory/`, `reports/`, `sync/`) rather than by what kind of file it is (`components/`, `hooks/`, `utils/` as top-level buckets with everything dumped in). This keeps a feature's offline logic, UI, and types close together, which matters more here than in a typical CRUD app because the sync behavior is the product.

## Business-type and branding configuration

Per `.agents/rules/reusability-and-multi-client.md`, business name, branding, and business-type defaults are configuration, never hardcoded conditionals scattered through feature code. If you find yourself writing `if (businessType === 'pharmacy')` inside a component, that logic belongs in the configuration layer, not the component.

## API conventions

REST over HTTPS, JSON, via Supabase's auto-generated PostgREST layer for standard CRUD and custom Edge Functions for sync merge and reporting aggregation logic. See `.agents/skills/write-edge-function.md` before adding a new Edge Function.

Pagination is cursor-based, never offset-based. Offset pagination breaks under concurrent inserts from multiple syncing devices, which is the normal operating condition here, not an edge case.

```
GET /rest/v1/products?order=updated_at.desc&limit=50&cursor={last_updated_at}
```

Every sync-queue item carries a client-generated UUID as an idempotency key, so a retried upload after a dropped connection never double-counts a sale or duplicates a stock movement.

Errors follow one consistent shape across every endpoint, never a raw stack trace or a bare HTTP status with no body:

```
{ "error": { "code": "STOCK_INSUFFICIENT", "message": "Not enough stock to complete this sale", "field": "quantity" } }
```

## Commit and PR discipline

A PR touching the ledger, RLS policies, or payment scope references the relevant rule file in its description. A reviewer, human or agent, checks the change against that rule file directly rather than trusting the PR description's summary of what it does.
