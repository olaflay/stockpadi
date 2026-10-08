# OjàPadi backend

This is OjàPadi's independently deployable Node.js application backend. It owns
authentication checks, account context, tenant and branch authorization, domain
operations, validation, email delivery, and privileged Supabase calls.

```bash
npm install
npm run build
npm start
```

`GET /health` is the process health endpoint. The frontend calls this backend
over HTTP; it does not import backend source code. This package must never
expose `SUPABASE_SERVICE_ROLE_KEY` to the frontend.

Database migrations remain exclusively in `../supabase/migrations/`.

`npm run db:verify` is read-only. It compares the repository migration set to
the hosted migration ledgers and checks required application tables and RPCs.
It requires `SUPABASE_DB_URL` and `SUPABASE_PROJECT_REF`, and must pass before
a production deploy is considered verified.

## Environment variables

Set these in `backend/.env`, never in `frontend/.env.local`:

```env
PORT=8787
NEXT_PUBLIC_APP_ENV=local
FRONTEND_ORIGIN=http://localhost:3000
NODE_ENV=development
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PROJECT_REF=YOUR_PROJECT_REF
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
SUPABASE_DB_URL=postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres
BUILD_VERSION=local
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

Service-role, SMTP, and Admin provisioning values are server-only secrets.
Never commit them or expose them through a `NEXT_PUBLIC_*` variable.

## Create the Platform Admin

There is no public Admin registration screen. From this directory, set the
private Admin values in `.env` and run:

```powershell
npm run provision:admin
```

The command creates a confirmed Supabase Auth user and an active
`platform_admins` record. It does not create a business membership. Sign in
through the normal frontend `/login` page; the Admin is routed to `/admin`.

The script intentionally refuses to create a second Admin when one already
exists. Never run it with a real password in a shared terminal recording.

## Deploy separately on Vercel

Create a separate Vercel project for this API with:

```text
Root Directory: backend
Install command: npm install
Framework preset: Other
Build command: leave empty
Output directory: leave empty
```

The `api/index.ts` Vercel Function handles all routes through `vercel.json`,
which explicitly selects the `@vercel/node` runtime.
Do not configure `dist/src/server.js` as the function entry point and do not
set a Start command; `src/server.ts` is only the long-running local entry point.

Set `NODE_ENV=production`, set `FRONTEND_ORIGIN` (or `FRONTEND_ORIGINS`) to the
exact deployed frontend URL, and add the Supabase and SMTP secrets from
`.env.example` in the Vercel project settings. Then verify both `/` and
`/health`, set the frontend `NEXT_PUBLIC_BACKEND_URL` to the resulting HTTPS
API URL, and redeploy the frontend. Browser feature requests still use
same-origin `/api/*`.

## Database boundary

Do not add migrations here. From the project root, use:

```powershell
npx supabase migration list
npx supabase db push
```

PostgreSQL, RLS, and RPCs remain the database source of truth. The Node API is
the only application sync boundary. Functions under `../supabase/functions/`
are compatibility adapters for deployments that still address the historical
function URLs; they contain no independent sync, authorization, or domain
logic and are not part of the browser runtime.
