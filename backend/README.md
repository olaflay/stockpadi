# StockPadi backend

This is StockPadi's independently deployable Node.js application backend. It owns
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

## Environment variables

Set these in `backend/.env`, never in `frontend/.env.local`:

```env
PORT=8787
FRONTEND_ORIGIN=http://localhost:3000
NODE_ENV=development
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
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

## Deploy separately

Deploy this directory as a Node service with:

```text
Root Directory: backend
Install command: npm install
Build command: npm run build
Start command: npm run start
Health check: /health
```

Set `NODE_ENV=production`, set `FRONTEND_ORIGIN` to the exact deployed
frontend URL, and set the frontend `NEXT_PUBLIC_BACKEND_URL` to the resulting
HTTPS API URL.

## Database boundary

Do not add migrations here. From the project root, use:

```powershell
npx supabase migration list
npx supabase db push
```

PostgreSQL, RLS, and RPCs remain the database source of truth. Specialized
offline sync and verification functions remain under `../supabase/functions/`
where intentionally required; they are not a replacement for this backend.
