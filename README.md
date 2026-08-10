# StockPadi

Offline-first inventory and point-of-sale PWA for a multi-tenant, 1-to-6-branch retail deployment.

## Stack

Next.js (App Router) + React + TypeScript (strict), Tailwind CSS v4, Dexie.js over IndexedDB for local-first storage, Serwist (Workbox) for the service worker and background sync, Supabase (Postgres, Auth, Realtime, Storage, Edge Functions) acting as the multi-tenant backend.

## Database

Schema, RLS policies, and the `sync_apply_*` functions live in `supabase/migrations/`. Apply them against a local or deployed Supabase instance with the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
npx supabase start   # local instance, requires Docker
npx supabase db reset
```

`sync-push` and `manage-staff` under `supabase/functions/` are `service_role`-only Edge Functions that assume this schema already exists — deploy the migrations before deploying the functions, never the other way around.

### Smoke test before first deploy

Run this against any freshly-migrated instance (local or the VPS) before pointing the app at it, to confirm the Edge Functions actually work against the schema they assume:

1. `npx supabase db reset` (or apply migrations to the target instance) and confirm it completes with no errors.
2. `npx supabase functions deploy sync-push manage-staff` (or `supabase functions serve` locally).
3. Launch the app and use the `/register` screen to create an owner account and provision a business profile. Log in, and complete one real sale end-to-end through `/pos` — confirms `sync_apply_sale` runs and the resulting stock movement and (if credit) `customer_credit_movements` row both land correctly.
4. Call `manage-staff` once (e.g. create a test cashier) to confirm that function's auth path works against the live instance, not just locally.

If any step fails, fix it before the first real VPS deploy — see `docs/SCAFFOLD.md` for current known gaps.

## Getting started

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local` with this deployment's Supabase URL and anon key (self-hosted instance, never Supabase Cloud), pointing at the instance you migrated above. Nothing in `.env.example` is a real credential.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The service worker is disabled in dev (Serwist doesn't yet support Turbopack); run `npm run build && npm run start` to test PWA/offline behavior for real.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run test` | Vitest (includes the mandatory ledger conflict test, see `.agents/skills/write-offline-conflict-test.md`) |

## Project structure

```
src/app/          Next.js routes (thin — delegate to features/lib)
src/features/     One folder per product area (pos, inventory, sync, ...), each with its own README
src/components/ui/ Shared screen-state primitives (offline banner, sync indicator, skeleton, ...)
src/config/       Business-type templates and branding — the per-client fork boundary
src/lib/          Cross-feature infra: Dexie client, Supabase client, shared hooks
src/types/        Types shared across the client/server boundary
supabase/         Postgres migrations and RLS policies
docs/             PRD and scaffold log
```

## Docs

- [`AGENTS.md`](AGENTS.md) — locked decisions, rules index, skills index
- [`docs/PRD.md`](docs/PRD.md) — product requirements
- [`docs/SCAFFOLD.md`](docs/SCAFFOLD.md) — what's been built so far and what's still a stub
