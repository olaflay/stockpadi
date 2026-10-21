# Backend split and deployment topology

The repository is intentionally composed of separately deployable applications:

```text
frontend/                 Next.js PWA deployed as the frontend Vercel project
backend/                  Node HTTP API deployed as the backend Vercel project
packages/contracts/       The only root npm workspace shared by both builds
supabase/                 migrations, RLS/RPC tests, and compatibility functions
```

There is no root Vercel application. The deployable manifests live at
`frontend/next.config.ts` and `backend/vercel.json`; the root package only
orchestrates local checks and builds. This prevents a composite Vercel service
definition from obscuring which project owns the browser and API runtimes.

The frontend calls the backend over `/api/*` (same-origin in the browser). The
Next.js rewrite and server-side callers use `NEXT_PUBLIC_BACKEND_URL`. The
backend owns request
authentication, account context, application authorization, sync orchestration,
and privileged Supabase calls. Postgres/RLS/RPCs remain authoritative.

`supabase/functions/` is not a second backend. The deployed function entry
points are compatibility adapters for historical URLs and proxy to matching
Node routes. They may be removed only after deployment traffic confirms that
no client still calls them.

The separate package locks are intentional. Root scripts orchestrate checks;
they do not turn frontend, backend, or Supabase into one workspace because each
has a different deployment/runtime boundary.
