# StockPadi

Offline-first inventory and point-of-sale PWA for a multi-tenant, 1-to-6-branch retail deployment.

## Stack

Next.js (App Router) + React + TypeScript (strict), Tailwind CSS v4, Dexie.js over IndexedDB for local-first storage, Serwist (Workbox) for the service worker and background sync, Supabase Cloud (Postgres, Auth, Realtime, Storage, Edge Functions) acting as the multi-tenant backend, deployed on Pxxl. See `.agents/rules/hosting-and-deployment.md` for the full hosting decision.

## Database

Schema, RLS policies, and the `sync_apply_*` functions live in the root `supabase/migrations/`. Use the linked Supabase Cloud project; Docker and a local Supabase stack are not required:

```bash
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push
npx supabase functions deploy sync-push
npx supabase functions deploy manage-staff
```

`sync-push` and `manage-staff` under `supabase/functions/` are `service_role`-only Edge Functions that assume this schema already exists — deploy the migrations before deploying the functions, never the other way around.

### Smoke test before first deploy

Run this against any freshly-migrated instance (local or the linked Supabase Cloud project) before pointing the app at it, to confirm the Edge Functions actually work against the schema they assume:

1. `npx supabase db push` and confirm it completes with no errors.
2. `npx supabase functions deploy sync-push` and `npx supabase functions deploy manage-staff`.
3. Launch the app and use the `/register` screen to create an owner account and provision a business profile. Log in, and complete one real sale end-to-end through `/pos` — confirms `sync_apply_sale` runs and the resulting stock movement and (if credit) `customer_credit_movements` row both land correctly.
4. Call `manage-staff` once (e.g. create a test cashier) to confirm that function's auth path works against the live instance, not just locally.

If any step fails, fix it before the first real Pxxl deploy — see `docs/SCAFFOLD.md` for current known gaps and `.agents/skills/pxxl-deploy-and-backup-check.md` for the deploy checklist.

## Getting started

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local` with this deployment's Supabase Cloud project URL and anon key, pointing at the project you migrated above. Nothing in `.env.example` is a real credential.

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
../supabase/      Postgres migrations, RLS policies and Edge Functions
docs/             PRD and scaffold log
```

## Docs

- [`AGENTS.md`](AGENTS.md) — locked decisions, rules index, skills index
- [`docs/PRD.md`](docs/PRD.md) — product requirements
- [`docs/SCAFFOLD.md`](docs/SCAFFOLD.md) — what's been built so far and what's still a stub
# StockPadi frontend

The frontend is independently installable and deployable:

```bash
npm install
npm run build
npm run start
```

It owns the Next.js UI, PWA, Dexie/IndexedDB cache, offline outbox, and API
calls. It uses only public Supabase URL/anon-key configuration. Authoritative
authorization and tenant validation happen in Supabase RLS/RPCs and Edge
Functions.
