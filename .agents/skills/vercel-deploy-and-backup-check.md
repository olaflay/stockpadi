---
name: vercel-deploy-and-backup-check
description: Use this for any deployment to Vercel/Supabase Cloud, and periodically to verify backups and uptime monitoring are actually working, not just configured.
---

# Vercel Deployment and Backup Verification

## Routine deployment

Push to the branch Vercel watches (`main`), confirm the build succeeds in Vercel's dashboard before considering a deploy complete, and check the app is actually reachable and functioning post-deploy, not just that the build step reported success. A green build is not the same as a working deployment.

## Database migrations on deploy

Migrations run as part of the deployment process, in a fixed order, against the Supabase Cloud project (`npx supabase db push` or equivalent CLI flow), matching exactly what ran in local development. Never apply a migration manually against the production database outside this process, per `.agents/rules/database-and-rls.md`.

## Backup verification, on a real schedule, not just once at setup

Confirm Supabase Cloud's automated backup is actually enabled for the project's tier and producing usable backups, on a recurring basis, not only checked when it was first configured. A backup that silently stopped running weeks ago is worse than having no backup at all, because it creates false confidence.

## Restore test

Before this deployment goes live with real client data, and periodically afterward, actually restore a backup (Supabase's point-in-time recovery or a manual dump) to a separate, non-production project and confirm the restored data is correct and complete. An untested restore procedure is a guess about disaster recovery, not a plan.

## Uptime monitoring

Confirm an alert reaches Olaflay directly (not just a dashboard that requires someone to remember to check it) if the deployment goes down. Test this by deliberately triggering a downtime alert once during setup, don't assume the alert configuration works because it looks correct.

## Secrets rotation

If any credential (database password, Supabase service key, SMTP password) is ever exposed, rotate it immediately through Vercel's environment variable settings and/or Supabase's project API settings, then redeploy — don't wait for a convenient moment. Document what was rotated and when in a way Olaflay can find later if the incident needs to be explained to the client.
