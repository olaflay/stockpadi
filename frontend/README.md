# StockPadi — frontend

Offline-first inventory and point-of-sale PWA for a multi-tenant, 1-to-6-branch retail deployment. This directory is the independently installable and deployable Next.js frontend.

## Stack

Next.js (App Router) + React + TypeScript (strict), Tailwind CSS v4, Dexie.js over IndexedDB for local-first storage, Serwist (Workbox) for the service worker and background sync, Supabase Cloud (Postgres, Auth, Realtime, Storage, Edge Functions) as the multi-tenant backend, deployed on Vercel.

## Getting started

```bash
npm install
cp .env.example .env.local
npm run dev
```

Fill `.env.local` with this deployment's Supabase Cloud project URL and anon key. Nothing in `.env.example` is a real credential.

Open http://localhost:3000. The service worker is disabled in dev (Serwist doesn't yet support Turbopack); run `npm run build && npm run start` to test PWA/offline behavior for real.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run test` | Vitest (includes the mandatory ledger conflict test) |

## Project structure

```
src/app/           Next.js routes (thin — delegate to features/lib)
src/features/      One folder per product area (pos, inventory, sync, ...)
src/components/ui/ Shared screen-state primitives (offline banner, sync indicator, skeleton, ...)
src/config/        Business-type templates and branding — the per-client fork boundary
src/lib/           Cross-feature infra: Dexie client, Supabase client, shared hooks
src/types/         Types shared across the client/server boundary
../supabase/       Postgres migrations, RLS policies and Edge Functions
```

## Where the rules and docs live

The canonical product rules, locked decisions, and docs live in the **repo root**, not here (so there is exactly one copy to keep in sync):

- `../AGENTS.md` — locked decisions, rules index, skills index
- `../.agents/rules/` — the engineering rules (hosting, ledger, RLS, design system, etc.)
- `../.agents/skills/` — procedural playbooks
- `../docs/` — PRD, scaffold log, research reports

The frontend owns the Next.js UI, PWA, Dexie/IndexedDB cache, offline outbox, and API calls. It uses only public Supabase URL/anon-key configuration. Authoritative authorization and tenant validation happen in Supabase RLS/RPCs and Edge Functions.
