# StockPadi

StockPadi is an offline-first inventory and point-of-sale PWA for small retail businesses. It supports products, stock, sales, customers, credit, purchases, expenses, reports, workers, branches, reconciliation, alerts, and multi-tenant business isolation.

## Architecture

The repository has three deliberately separate parts:

```text
frontend/  Next.js UI, routing, PWA, Dexie, IndexedDB, offline queue and API clients
backend/   Main application API, authentication, authorization and domain orchestration
supabase/  PostgreSQL, RLS, migrations, RPCs and specialized Edge Functions
```

Normal online requests use:

```text
frontend → backend API → Supabase/PostgreSQL
```

The intentional offline exception is:

```text
frontend Dexie/outbox → sync-push Edge Function → PostgreSQL RPC
```

PostgreSQL remains the source of truth. Stock and customer credit use append-only ledgers. Atomic ledger operations remain SQL/RPC responsibilities; the backend authenticates, authorizes, validates, and orchestrates them.

## Account model

There are exactly three top-level account types:

| Account | Routes | Purpose |
| --- | --- | --- |
| `ADMIN` | `/admin/*` | Platform administration and business review |
| `BUSINESS_OWNER` | `/business/*` | Full business management |
| `WORKER` | `/work/*` | Shared Worker-safe business experience |

Users do not select an account type during login. The backend resolves account context from the authenticated user and database membership. Legacy role columns may remain temporarily for data compatibility, but they are not the authoritative account model.

PIN unlock is not part of the current authentication model. Users authenticate through `/login` with Supabase Auth. Offline operation relies on the cached valid session and local application data; it does not use a PIN fallback.

## Repository layout

```text
stockpadi/
├── frontend/
│   ├── src/app/          Next.js routes and experience shells
│   ├── src/features/     UI features, Dexie writes, API clients and sync
│   ├── src/components/   Shared UI
│   ├── src/lib/          Supabase client, IndexedDB and utilities
│   └── .env.local        Frontend-only public variables
├── backend/
│   ├── src/app.ts        HTTP application and route dispatch
│   ├── src/server.ts     Server startup only
│   ├── src/middleware/   Authentication middleware
│   ├── src/modules/      Accounts, Workers, Admin and Sales domains
│   └── src/shared/       Errors, Supabase client and email transport
├── supabase/
│   ├── migrations/       Forward-only PostgreSQL migrations
│   ├── functions/        Specialized Edge Functions and compatibility adapters
│   └── __tests__/         Database/security tests
├── docs/
└── package.json          Root development commands
```

## Requirements

- Node.js 22 or newer is recommended.
- A Supabase project.
- Supabase CLI (`npx supabase`).
- SMTP credentials for Worker invitations and verification email.

## Install

From the repository root:

```powershell
npm install
npm --prefix frontend install
npm --prefix backend install
```

## Configure environments

Create local files from the examples:

```powershell
Copy-Item frontend/.env.example frontend/.env.local
Copy-Item backend/.env.example backend/.env
```

### `frontend/.env.local`

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_BACKEND_URL=http://localhost:8787
```

`NEXT_PUBLIC_BACKEND_URL` is required for normal application APIs. The frontend must not silently switch to an Edge Function implementation when it is missing.

The only direct Edge Function calls retained by the frontend are the intentional specialized paths for sync and verification.

### `backend/.env`

```env
PORT=8787
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY

SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=resend
SMTP_PASS=YOUR_SMTP_API_KEY
SMTP_FROM="StockPadi <noreply@yourdomain.com>"
DEV_LOG_VERIFICATION_CODES=false
```

Never expose service-role, database, or SMTP secrets through `NEXT_PUBLIC_*`, frontend source, IndexedDB, or browser bundles.

## Run locally

Run the frontend and backend in separate terminals. The commands below are run
from the repository root (`stockpadi/`).

Terminal 1:

```powershell
npm run backend:start
```

If your terminal is already inside `backend/`, use this instead:

```powershell
npm run start
```

Terminal 2:

```powershell
npm run dev
```

Open:

```text
http://localhost:3000
```

Check the backend:

```text
http://localhost:8787/health
```

For a local/staging database, create one test Owner after applying migrations:

```powershell
npm run seed:owner -- --name "Test Owner" --email owner@example.com --password "change-me-now" --business-name "Test Shop"
```

This uses `backend/.env`, creates the Auth user, calls the same owner-provisioning
RPC as registration, and refuses to create a duplicate Owner. It does not use PINs.

To create a platform Admin, set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and optionally
`ADMIN_FULL_NAME` in `backend/.env`, then run:

```powershell
npm run provision:admin
```

The backend is independently deployable:

```powershell
npm run backend:build
npm run backend:start
```

The frontend is independently deployable:

```powershell
npm run frontend:build
npm run start
```

## Supabase migrations and functions

Link the repository to Supabase:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

The canonical account resolver is created by:

```text
supabase/migrations/20260817000000_canonical_account_context.sql
```

Apply migrations before enabling the backend in a deployed environment.

The remaining intentional Edge Functions are:

| Function | Status |
| --- | --- |
| `sync-push` | Keep: offline outbox protocol and RPC application |
| `verify-email` | Keep: specialized verification workflow |
| `send-verification` | Keep: specialized email workflow |
| `manage-staff` | Compatibility adapter forwarding to backend |
| `platform-api` | Compatibility path; normal calls use backend `/api/admin` |
| `account-context` | Compatibility path; normal calls use backend `/api/account-context` |
| `void-sale` | Compatibility path; normal calls use backend `/api/sales/void` |
| `register-business` | Compatibility adapter forwarding registration to backend `/api/businesses/register` |

Configure the compatibility Worker adapter with a Supabase secret:

```powershell
npx supabase secrets set BACKEND_URL=https://YOUR_BACKEND_HOST
```

Compatibility adapters emit a `compatibility_edge_function_call` log event and an
`X-StockPadi-Compatibility-Adapter` response header. Use Supabase function logs and
deployment access logs to verify zero traffic before removing an adapter.

Deploy specialized functions as needed:

```powershell
npx supabase functions deploy sync-push
npx supabase functions deploy verify-email
npx supabase functions deploy send-verification
npx supabase functions deploy manage-staff
```

Configure email delivery as Supabase Function secrets (never commit these values):

```powershell
npx supabase secrets set SMTP_HOST=smtp.resend.com
npx supabase secrets set SMTP_PORT=465
npx supabase secrets set SMTP_SECURE=true
npx supabase secrets set SMTP_USER=resend
npx supabase secrets set SMTP_PASS=YOUR_SMTP_API_KEY
npx supabase secrets set SMTP_FROM="StockPadi <noreply@yourdomain.com>"
npx supabase secrets set DEV_LOG_VERIFICATION_CODES=false
```

For local development only, set `DEV_LOG_VERIFICATION_CODES=true` and
`NODE_ENV=development` in the Edge Function environment. The verification code
will then be printed with a `[DEV ONLY]` warning. Never enable this in a deployed
environment.

The verification implementation runs in the backend. The Supabase function
directories are compatibility adapters for older clients. For local adapter
testing, copy `supabase/.env.example` to `supabase/.env.local` and start it with:

```powershell
npx supabase functions serve send-verification --env-file supabase/.env.local
```

Do not run `supabase db reset` against production. Historical migrations are immutable; add new forward migrations only.

## Account provisioning

### Platform Admin

Admin accounts are provisioned privately:

```powershell
$env:ADMIN_EMAIL="admin@example.com"
$env:ADMIN_PASSWORD="use-a-long-unique-password"
$env:ADMIN_FULL_NAME="StockPadi Admin"
npm run provision:admin
```

### Business Owner

Open `/register`. Registration creates one business, one owner membership, and one default branch through the trusted registration workflow.

### Worker

The Business Owner uses `/business/staff`. Worker creation is online-only and is handled by the backend Worker API:

```text
POST /api/workers
```

The backend creates the Auth account, Worker profile, membership, branch assignment, audit record, and credential email. Auth and PostgreSQL are separate systems, so failed provisioning uses explicit compensation rather than claiming cross-system transactionality.

## Important API routes

```text
POST /api/account-context
POST /api/workers
POST /api/admin
POST /api/sales/void
GET  /health
```

All protected routes require a Supabase bearer token. Tenant, account, business status, Worker status, and branch access are resolved server-side.

## Verification commands

Run these before merging architecture, authorization, or database changes:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run backend:build
```

For focused checks:

```powershell
npm run backend:typecheck
npm run backend:test
npm run frontend:build
```

The current baseline is 73 frontend tests and 23 backend tests. Production builds should be run sequentially with typechecking when possible because Next.js generates `.next/types` during builds.

## Offline and ledger rules

- Dexie and IndexedDB remain frontend-owned.
- Outbox processing remains FIFO.
- `client_id` values provide idempotency.
- Failed sync items remain visible and retryable.
- `sync-push` revalidates the canonical account context before using service-role RPC calls.
- PostgreSQL remains authoritative for tenant isolation and RLS.
- Stock movements and customer credit movements are append-only.
- Inventory and credit balances remain derived data.
- Voids and refunds require an online connection.
- A browser-supplied business ID, branch ID, role, or account type is never trusted for authorization.

## What comes next

The architecture is now separated for the migrated domains, but the migration is intentionally incomplete. The next work should be:

1. Apply and verify the canonical account-context migration in the deployed Supabase project.
2. Run production smoke tests for Owner, Worker, Admin, suspension, disabled Worker, tenant isolation, and branch isolation.
3. Monitor compatibility-adapter traffic after deployment; remove each adapter only after its production usage is confirmed to be zero.
4. Expand backend integration coverage against a deployed/staging API, preserving the existing database/RPC tests.
5. Add deployment health checks confirming `NEXT_PUBLIC_BACKEND_URL`, backend Supabase secrets, SMTP configuration, and the canonical RPC are available.
6. Continue moving remaining normal online domain operations behind backend modules where the frontend still calls Supabase directly.

Do not migrate offline sync or rewrite ledger SQL merely to move files. The objective is one active application backend, one database authorization model, preserved offline behavior, and clear deployable boundaries.

## Rules and documentation

- `AGENTS.md` — repository rules and locked decisions
- `docs/PRD.md` — product requirements
- `.agents/rules/database-and-rls.md` — tenant isolation and RLS
- `.agents/rules/offline-sync-and-ledger.md` — offline and ledger behavior
- `.agents/rules/hosting-and-deployment.md` — deployment and secrets
- `.agents/rules/testing-and-qa.md` — test expectations
