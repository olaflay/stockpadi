# Hosting and Deployment

## The decision

Self-hosted Supabase (Postgres, Auth, Realtime, Storage, Edge Functions) and the Next.js app, both deployed on a single VPS, managed through Coolify for git-push deploys and automated backups. Not Vercel. Not Supabase Cloud.

**VPS provider: Oracle Cloud "Always Free" tier**, chosen over a paid Hetzner/DigitalOcean droplet specifically for $0/month cost — confirmed with Olaflay, cost was the deciding constraint over operational simplicity. This carries real, accepted tradeoffs a paid VPS doesn't have:
- Free-tier Ampere (ARM) instances are frequently capacity-constrained in popular regions; provisioning one is not guaranteed on the first attempt.
- Oracle has a documented history of flagging free-tier accounts as inactive/abusive and reclaiming resources or suspending accounts with little warning. Mitigate this deliberately: keep the instance genuinely active (real traffic, regular logins), enable Oracle's billing/usage alerts, and treat the automated-backup requirement below as non-negotiable specifically because of this risk, not just as general hygiene.
- If this risk ever becomes unacceptable (an account suspension actually happens, or capacity issues block a needed resize), the documented fallback is a paid Hetzner/DigitalOcean droplet at $10-20/month, same Coolify setup, no other architecture change needed.

## Why, so this doesn't get silently reversed mid-build

This was chosen after checking real developer cost sentiment rather than defaulting to the managed-cloud option that most tutorials assume. Reddit threads on Supabase alternatives consistently surface self-hosting on a cheap VPS as the top-voted recommendation over switching to a different managed BaaS. A developer running the equivalent stack reported it working comfortably on a $10/month, 2GB RAM droplet. A purpose-built migration tool exists specifically because Supabase's own hosted pricing curve runs from $25/month toward several thousand dollars a month at scale that this deployment will never reach, self-hosting for this workload runs $20 to $200 a month depending on tier, and this deployment sits at the low end of that range.

The same research process ruled out Vercel specifically because of billing unpredictability, not capability. A recurring, well-documented failure mode across independent write-ups is a normal month at a few hundred GB of bandwidth turning into a $400+ bill in a traffic spike month, for workloads far smaller than what this deployment is architected for. This app is offline-first by design, most of its work happens against local IndexedDB, it does not need Vercel's edge-rendering strengths to function well.

PocketBase was considered and rejected. It is the most Reddit-loved self-hosted BaaS right now and would be cheaper still, but its SQLite foundation and simpler rule engine would require rebuilding the transactional guarantees the ledger and RLS design depend on. That is not a hosting decision, it is redoing finished architecture work to save a small amount of money on a system holding another business's real financial and stock data.

Render (managed Postgres plus a managed web service, no self-hosting) is the documented fallback if VPS operations ever become the wrong tradeoff for available time. It costs somewhat more than the self-hosted VPS but removes all patching, backup, and uptime responsibility. If this deployment's hosting is ever moved to Render, update this file and `AGENTS.md`'s locked decisions together, do not leave them disagreeing.

## Edge reverse proxy

An explicit nginx reverse proxy sits in front of the Coolify-managed app and Supabase containers (template at `deploy/nginx/stockpadi.conf`), terminating TLS and forwarding to the app and to Supabase's Kong gateway. This is additive to, not a replacement for, Coolify (Coolify still owns the containers, git-push deploys, and backups) — confirmed with Olaflay when this was added, so it does not get silently reversed as "Coolify already has a proxy built in."

## Operational requirements on the VPS

Automated backups configured through Coolify, verified working, not just configured. A documented restore procedure that has actually been tested once before this goes live with real client data, not assumed to work because the backup job runs on schedule. Uptime monitoring with an alert that reaches Olaflay directly, not just a dashboard nobody checks. See `.agents/skills/vps-deploy-and-backup-check.md` for the concrete checklist.

## Secrets and environment configuration

Database credentials, Supabase service keys, and any future payment provider keys live in environment variables managed through Coolify, never committed to the repository, never hardcoded in a config file that gets checked in. This is also a reusability requirement, see `.agents/rules/reusability-and-multi-client.md`, a second client's credentials must never be reachable from the first client's deployment.
