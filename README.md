# StockPadi

StockPadi is an offline-first inventory, sales, customer-credit, and point-of-sale app for retail businesses.

This guide explains how to run, test, update the database, and deploy StockPadi without needing to understand the code.

## The three parts

```text
frontend/  The screens, PWA, offline cache, and local queue
backend/   The secure application server
supabase/  The database, login system, security rules, migrations, and Edge Functions
```

Normal online traffic is:

```text
frontend → backend → Supabase/PostgreSQL
```

Offline sales are queued in the frontend and later checked by the sync service and database.

## Install once

Install:

- Node.js 22 or newer
- Git
- Supabase CLI
- Docker Desktop only if you want a completely local Supabase database

Check Node:

```powershell
node --version
```

Node 20 can cause Supabase WebSocket warnings and Windows test-process errors. Use Node 22 or newer.

## First-time setup

Open PowerShell in the project folder:

```powershell
cd C:\Users\YOUR_NAME\Desktop\Projects\stockpadi
```

Install both applications:

```powershell
cd frontend
npm install
cd ..\backend
npm install
cd ..
```

Create private local configuration files:

```powershell
Copy-Item frontend\.env.example frontend\.env.local
Copy-Item backend\.env.example backend\.env
```

Never commit or share `.env` or `.env.local`.

## Configure Supabase and email

Put these public values in `frontend/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_BACKEND_URL=http://localhost:8787
```

Put these private values in `backend/.env`:

```env
PORT=8787
FRONTEND_ORIGIN=http://localhost:3000
# Multiple allowed frontend origins may be comma-separated.
# FRONTEND_ORIGINS=http://localhost:3000,https://stockpadi-drab.vercel.app
NODE_ENV=development
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
SMTP_FROM="StockPadi <noreply@example.com>"
DEV_LOG_VERIFICATION_CODES=false
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=use-a-long-unique-password
ADMIN_FULL_NAME=StockPadi Admin
```

The service-role key, SMTP credentials, and Admin provisioning values belong
only in the backend. They must never use `NEXT_PUBLIC_` names.

Environment key guide:

| Key | File | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `frontend/.env.local` | Public Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `frontend/.env.local` | Public anonymous browser key. |
| `NEXT_PUBLIC_SITE_URL` | `frontend/.env.local` | Browser URL of the frontend. |
| `NEXT_PUBLIC_BACKEND_URL` | `frontend/.env.local` | HTTPS URL of the deployed backend. |
| `NEXT_PUBLIC_BUSINESS_NAME` | `frontend/.env.local` | Optional displayed brand name. |
| `NEXT_PUBLIC_BRAND_ACCENT_COLOR` | `frontend/.env.local` | Optional brand color. |
| `NEXT_PUBLIC_BRAND_LOGO_URL` | `frontend/.env.local` | Optional public logo URL. |
| `PORT` | `backend/.env` | Backend HTTP port. |
| `FRONTEND_ORIGIN` | `backend/.env` | Exact frontend origin allowed by CORS. |
| `NODE_ENV` | `backend/.env` | `development` locally, `production` when deployed. |
| `SUPABASE_URL` | `backend/.env` | Server-side Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | `backend/.env` | Private privileged server key. Never expose it. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | `backend/.env` | SMTP connection settings. |
| `SMTP_USER`, `SMTP_PASS` | `backend/.env` | Private SMTP credentials. |
| `SMTP_FROM` | `backend/.env` | Sender for verification and Worker emails. |
| `DEV_LOG_VERIFICATION_CODES` | `backend/.env` | Keep `false`; never enable in production. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_FULL_NAME` | `backend/.env` | One-time private Admin provisioning inputs. |

The root `.env.example` only points to the two real environment files. The
frontend and backend do not load the root file.

## Update the database

Historical migrations must not be edited. New migrations are added under `supabase/migrations/`.

Connect the repository to your hosted Supabase project:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
```

See which migrations are already applied:

```powershell
npx supabase migration list
```

Apply pending migrations:

```powershell
npx supabase db push
```

Important:

- `supabase db push` changes the linked remote database.
- Never run `supabase db reset` against production.
- If a migration already exists, inspect migration history; do not force it.
- `supabase status` needs Docker only for a local Supabase stack.

For disposable local database testing only:

```powershell
npx supabase start
npx supabase db reset
```

## Run locally

Use two PowerShell windows.

### Window 1: backend

```powershell
cd C:\Users\YOUR_NAME\Desktop\Projects\stockpadi\backend
npm run start
```

Check it:

```text
http://localhost:8787/health
```

### Window 2: frontend

```powershell
cd C:\Users\YOUR_NAME\Desktop\Projects\stockpadi\frontend
npm run dev
```

Open `http://localhost:3000`.

The backend must be running and `NEXT_PUBLIC_BACKEND_URL` must be correct, otherwise registration and account-context requests will fail.

## Test each account

Use separate browser profiles for Owner, Worker, and Admin. Each profile has separate cookies and offline data.

### Business Owner

1. Open `/register` and create a business.
2. Confirm the Owner reaches `/business`.
3. Open `/business/staff`; initially only the Business Owner should appear.
4. Create a Worker and confirm the Worker appears only after provisioning succeeds.
5. Add a product, choose an existing branch, and make a sale at `/business/pos`.
6. Check sales, inventory, reports, customers, close day, and staff.
7. Disable and reactivate the Worker.

### Worker

1. Use the credentials sent by the Owner.
2. Sign in through `/login`.
3. Confirm the Worker reaches `/work`.
4. Test `/work/pos`, `/work/products`, `/work/inventory`, `/work/stock-count`, `/work/close-day`, `/work/customers`, and `/work/alerts`.
5. Confirm the Worker cannot manage Staff, branches, products, expenses, settings, full reports, or `/admin`.
6. Confirm the Worker cannot change their own password.

### Platform Admin

There is no public Admin registration page. From `backend/`, provision the
first Admin privately:

```powershell
$env:ADMIN_EMAIL="admin@example.com"
$env:ADMIN_PASSWORD="use-a-long-unique-password"
$env:ADMIN_FULL_NAME="StockPadi Admin"
npm run provision:admin
```

The command creates a confirmed Supabase Auth user and an active
`platform_admins` record. It does not create a business or business
membership. Sign in through `/login`; the Admin should reach `/admin` without
a business membership. Test business approval, rejection, suspension,
reactivation, and broadcasts.

The command intentionally stops if a Platform Admin already exists. Do not run
it in the browser, do not put the service-role key in Vercel frontend
variables, and do not share the Admin password in screenshots or terminal
logs.

## Test two-business isolation

1. Owner A creates Business A and Product A.
2. Owner B creates Business B and Product B.
3. Confirm A cannot see B Staff, products, sales, customers, branches, purchases, expenses, reports, or stock.
4. Confirm B cannot see A data.
5. When specifically testing one browser, sign out and switch accounts; confirm each account's cached data and outbox remain separated by `businessId`.

## Test offline sales

1. Sign in while online.
2. Turn off the network.
3. Make an allowed sale.
4. Refresh the browser and confirm it remains pending.
5. Turn the network back on.
6. Wait for sync.
7. Confirm exactly one server sale exists.
8. Retry or refresh again and confirm no duplicate is created.

The server rechecks the account, business, Worker status, branch, and operation during sync. IndexedDB is never the final authority.

## Quality checks

From the root:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run backend:build
```

Separately:

```powershell
cd frontend
npm run lint
npm run typecheck
npm test
npm run build

cd ..\backend
npm run typecheck
npm test
npm run build
```

If tests fail with a Windows Node `EPERM` error mentioning `C:\Users\...`, upgrade to Node 22, restart PowerShell/VS Code, reinstall dependencies, and retry. Do not delete the Supabase database or IndexedDB to fix this error.

## Deployment

### Frontend on Vercel

Create a Vercel project connected to this repository and set its Root Directory to:

```text
frontend
```

Set the install command to `npm install` and build command to `npm run build`.
Add only these public frontend variables:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
NEXT_PUBLIC_SITE_URL=https://YOUR_FRONTEND_DOMAIN
NEXT_PUBLIC_BACKEND_URL=https://YOUR_BACKEND_DOMAIN
```

Optional public branding variables may also be added:

```env
NEXT_PUBLIC_BUSINESS_NAME=StockPadi
NEXT_PUBLIC_BRAND_ACCENT_COLOR=#0a6e4d
NEXT_PUBLIC_BRAND_LOGO_URL=https://your-domain/logo.png
```

Do not add `SUPABASE_SERVICE_ROLE_KEY`, `SMTP_PASS`, `SMTP_USER`,
`ADMIN_PASSWORD`, or any other backend secret to Vercel. After setting or
changing environment variables, redeploy so the Next.js build receives them.

### Backend

Deploy `backend/` as a separate Vercel project. Its `api/index.ts` entry point
adapts the Node API to the explicitly configured `@vercel/node` Function;
`src/server.ts` remains the local long-running server and must not be selected
as the deployed function.

Use:

```text
Root Directory: backend
Framework preset: Other
Build command: leave empty
Output directory: leave empty
```

Do not set a Start command. Add the private variables from
`backend/.env.example`. After deployment, verify both
`https://YOUR_BACKEND_DOMAIN/` and `https://YOUR_BACKEND_DOMAIN/health`, then
set the frontend `NEXT_PUBLIC_BACKEND_URL` to that URL and redeploy the
frontend.

For production backend variables, use:

```env
NODE_ENV=production
FRONTEND_ORIGIN=https://YOUR_FRONTEND_DOMAIN
```

Then add the production Supabase and SMTP secrets through the backend host's
secret manager. Never commit them to GitHub.

### Supabase

Deploy database changes and specialized functions separately:

```powershell
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
npx supabase functions deploy sync-push
npx supabase functions deploy verify-email
npx supabase functions deploy send-verification
```

Keep compatibility functions only while they receive traffic. Remove them only after logs confirm they are unused.

## Account and security rules

- `ADMIN` is platform administration.
- `BUSINESS_OWNER` manages their own business.
- `WORKER` performs assigned operational work.
- Workers are restricted to assigned branches.
- Workers cannot manage products, Staff, branches, expenses, settings, full reports, or data restore.
- Worker stock counts are pending submissions; they are not unrestricted stock corrections.
- Owners can reset Worker passwords; Workers cannot change their own passwords.
- Stock and credit history are append-only ledgers.
- Voids create reversal movements instead of deleting history.
- Browser-supplied business, branch, role, or account values are never trusted for authorization.

## Troubleshooting

### Login says “check your connection”

Check that `http://localhost:8787/health` works, the backend terminal is running, and `frontend/.env.local` contains `NEXT_PUBLIC_BACKEND_URL=http://localhost:8787`.

### “No active account context found”

The Auth user does not have a valid active Admin record or business membership, or the business/Worker is disabled. Check the database membership and business status; do not fix this by editing browser metadata.

### Product says “add a branch”

Create a branch under `/business/branches` or `/business/settings/branches`, then refresh the product form. The branch must belong to the current business.

### Migration says a policy already exists

Do not edit a deployed migration. Check `npx supabase migration list` and use a new forward migration with `drop policy if exists` before recreating a policy.

## Architecture reference

PostgreSQL is the source of truth. RLS and backend authorization enforce tenant and branch isolation. Dexie and IndexedDB are frontend offline storage only. `sync-push` is the intentional specialized Edge Function for queued offline operations. The main application API lives in `backend/`.

See `AGENTS.md`, `docs/PRD.md`, and `.agents/rules/` for the detailed engineering rules.
