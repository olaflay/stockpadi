# Hosting and Deployment

## The decision

The Next.js app deploys on **Vercel** (git-push deploys from GitHub, auto-detected Next.js build, automatic HTTPS/CDN, environment variables managed in the Vercel dashboard). The backend is **Supabase Cloud** (managed Postgres, Auth, Realtime, Storage, Edge Functions). Not a self-hosted VPS. Previously Pxxl; moved to Vercel 2026-08-25 (confirmed with Olaflay).

## Why this supersedes the original self-hosted VPS plan

This project was originally scoped for a self-hosted Supabase + Coolify stack on an Oracle Cloud free-tier VPS (see `docs/PRD.md` for that original research). That plan was superseded — confirmed with Olaflay — in favor of Vercel plus Supabase Cloud, prioritizing zero ops burden (no server patching, no manual backup/restore verification, no Oracle free-tier suspension risk) over the marginal cost savings of self-hosting. Supabase Cloud's managed pricing tiers are well within range for this workload's scale (1-6 branches per client), and Vercel's git-push workflow matches the existing GitHub-based flow with no VPS or reverse-proxy config to maintain.

If hosting is ever moved again, update this file and `AGENTS.md`'s locked decisions together, do not leave them disagreeing.

## Deployment workflow

Push to the branch Vercel watches (`main`). Vercel auto-detects the Next.js build, runs `npm run build`, and deploys with zero downtime. Confirm the build succeeded in the Vercel dashboard and that the app is actually reachable and functioning post-deploy, not just that the build step reported success. A green build is not the same as a working deployment. See `.agents/skills/vercel-deploy-and-backup-check.md` for the concrete checklist.

## Database migrations on deploy

Migrations run against the Supabase Cloud project via the Supabase CLI (`npx supabase db push` or the linked project's migration flow), in a fixed order, matching exactly what ran in local development. Never apply a migration manually against the production database outside this process, per `.agents/rules/database-and-rls.md`.

## Edge Functions

`sync-push`, `manage-staff`, `send-verification`, `verify-email`, and `void-sale` under `supabase/functions/` deploy via `npx supabase functions deploy <name>` against the linked Supabase Cloud project. Deploy migrations before deploying functions that assume the resulting schema, never the other way around.

## Operational requirements

Supabase Cloud provides automated Postgres backups on paid tiers — confirm the project's backup retention matches what real client data requires, this is not automatic on the free tier. A documented restore procedure that has actually been tested once before this goes live with real client data, not assumed to work because Supabase says backups are enabled. Uptime monitoring with an alert that reaches Olaflay directly (Supabase's own status page plus a lightweight external uptime check on the Vercel-hosted URL), not just a dashboard nobody checks. See `.agents/skills/vercel-deploy-and-backup-check.md`.

## Secrets and environment configuration

Database credentials, Supabase service keys, SMTP credentials, and any future payment provider keys live in environment variables managed through the Vercel dashboard (app-side) and Supabase's project settings (Edge Function secrets), never committed to the repository, never hardcoded in a config file that gets checked in. This is also a reusability requirement, see `.agents/rules/reusability-and-multi-client.md` — a second client's credentials must never be reachable from the first client's deployment.
