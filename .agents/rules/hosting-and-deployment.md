# Hosting and Deployment

## The decision

The Next.js app and Node API deploy on **Vercel** (git-push deploys from GitHub, automatic HTTPS/CDN, and environment variables managed in each Vercel project). Supabase Cloud provides managed Postgres, Auth, Realtime, Storage, RLS, and RPCs. The Node API is the canonical application boundary; Supabase Functions are compatibility adapters only. This is not a self-hosted VPS. Previously Pxxl; moved to Vercel 2026-08-25 (confirmed with Olaflay).

## Why this supersedes the original self-hosted VPS plan

This project was originally scoped for a self-hosted Supabase + Coolify stack on an Oracle Cloud free-tier VPS (see `docs/PRD.md` for that original research). That plan was superseded — confirmed with Olaflay — in favor of Vercel plus Supabase Cloud, prioritizing zero ops burden (no server patching, no manual backup/restore verification, no Oracle free-tier suspension risk) over the marginal cost savings of self-hosting. Supabase Cloud's managed pricing tiers are well within range for this workload's scale (1-6 branches per client), and Vercel's git-push workflow matches the existing GitHub-based flow with no VPS or reverse-proxy config to maintain.

If hosting is ever moved again, update this file and `AGENTS.md`'s locked decisions together, do not leave them disagreeing.

## Deployment workflow

Push to the branch Vercel watches (`main`). Vercel auto-detects the Next.js build, runs `npm run build`, and deploys with zero downtime. Confirm the build succeeded in the Vercel dashboard and that the app is actually reachable and functioning post-deploy, not just that the build step reported success. A green build is not the same as a working deployment. See `.agents/skills/vercel-deploy-and-backup-check.md` for the concrete checklist.

## Database migrations on deploy

Migrations run against the Supabase Cloud project via the Supabase CLI (`npx supabase db push` or the linked project's migration flow), in a fixed order, matching exactly what ran in local development. Never apply a migration manually against the production database outside this process, per `.agents/rules/database-and-rls.md`.

## Supabase compatibility functions

`sync-push`, `manage-staff`, `send-verification`, `verify-email`, and `void-sale` under `supabase/functions/` are compatibility adapters that deploy via `npx supabase functions deploy <name>` when a legacy URL still needs to be supported. They forward to the Node API and contain no authoritative sync or domain implementation. Deploy migrations before deploying backend code or adapters that assume the resulting schema, never the other way around. Decommission an adapter only after deployment traffic confirms it is unused.

## Operational requirements

Supabase Cloud provides automated Postgres backups on paid tiers — confirm the project's backup retention matches what real client data requires, this is not automatic on the free tier. A documented restore procedure that has actually been tested once before this goes live with real client data, not assumed to work because Supabase says backups are enabled. Uptime monitoring with an alert that reaches Olaflay directly (Supabase's own status page plus a lightweight external uptime check on the Vercel-hosted URL), not just a dashboard nobody checks. See `.agents/skills/vercel-deploy-and-backup-check.md`.

## Secrets and environment configuration

Database credentials, Supabase service keys, SMTP credentials, and any future payment provider keys live in environment variables managed through the Vercel dashboard (app/backend-side) and Supabase's project settings (compatibility-function secrets), never committed to the repository, never hardcoded in a config file that gets checked in. This is also a reusability requirement, see `.agents/rules/reusability-and-multi-client.md` — a second client's credentials must never be reachable from the first client's deployment.
