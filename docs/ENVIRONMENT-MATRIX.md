# Environment matrix

The authoritative deployment topology is:

```text
Next.js frontend -> same-origin /api proxy -> Node backend -> Supabase PostgreSQL/RLS/RPC
```

The frontend uses Supabase only for Auth. Business reads, writes, and sync go
through the Node API. The service worker caches the app shell and wakes the
Dexie coordinator; it is not a second mutation transport.

## Current repository evidence

| Environment | Component | Current evidence | Status |
|---|---|---|---|
| local | frontend | `frontend/.env.local`; hosted Supabase project A; local backend URL | configured, but not aligned with backend |
| local | backend | `backend/.env`; hosted Supabase project B; `NODE_ENV=development`; deployed-looking backend URL | configured, but not aligned with frontend |
| local | Supabase CLI | `supabase/.temp` is linked to project A | does not prove production identity |
| preview/staging | frontend/backend | Vercel URLs are documented, but Vercel environment variables are not readable from this repository | unverified |
| production | frontend/backend/Supabase | deployed health endpoints exist, but project identity and migration head require the new checks | unverified |

Project references and credentials are intentionally not recorded in this
document. Runtime identity endpoints expose only the non-secret project
reference after deployment.

## Required contract

`packages/contracts/src/environment-contract.json` is the machine-readable
contract. Each non-local deployment must set explicit identity:

| Component | Identity | Required destination |
|---|---|---|
| frontend | `NEXT_PUBLIC_APP_ENV`, `NEXT_PUBLIC_SUPABASE_PROJECT_REF`, `NEXT_PUBLIC_BUILD_VERSION` | HTTPS Vercel frontend |
| backend | `APP_ENV`, `SUPABASE_PROJECT_REF`, `BUILD_VERSION` | HTTPS Vercel Node function |
| Supabase | one matching project reference in both components | PostgreSQL/Auth/RLS/RPC for that environment |
| migration verifier | `SUPABASE_PROJECT_REF`, `SUPABASE_DB_URL` | read-only connection to that environment's database |
| service worker | build version embedded in cache name | same frontend build |

The frontend and backend project references, API version, environment, build
version, backend URL, and CORS origin must match. Startup validation rejects
missing production identity, localhost production URLs, development logging,
invalid URLs, public server secrets, and project URL/reference mismatches.
