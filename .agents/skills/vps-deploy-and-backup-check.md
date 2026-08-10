---
name: vps-deploy-and-backup-check
description: Use this for any deployment to the Coolify-managed VPS, and periodically to verify backups and uptime monitoring are actually working, not just configured.
---

# VPS Deployment and Backup Verification

## Routine deployment

Push to the branch Coolify watches, confirm the build succeeds in Coolify's dashboard before considering a deploy complete, and check the app is actually reachable and functioning post-deploy, not just that the build step reported success. A green build is not the same as a working deployment.

## Database migrations on deploy

Migrations run as part of the deployment process, in a fixed order, against the production database, matching exactly what ran in local development. Never apply a migration manually against the production database outside this process, per `.agents/rules/database-and-rls.md`.

## Backup verification, on a real schedule, not just once at setup

Confirm Coolify's automated backup job actually ran and produced a usable backup file, on a recurring basis, not only checked when it was first configured. A backup job that silently stopped running weeks ago is worse than having no backup at all, because it creates false confidence.

## Restore test

Before this deployment goes live with real client data, and periodically afterward, actually restore a backup to a separate, non-production environment and confirm the restored data is correct and complete. An untested restore procedure is a guess about disaster recovery, not a plan.

## Uptime monitoring

Confirm an alert reaches Olaflay directly (not just a dashboard that requires someone to remember to check it) if the deployment goes down. Test this by deliberately triggering a downtime alert once during setup, don't assume the alert configuration works because it looks correct.

## Secrets rotation

If any credential (database password, Supabase service key) is ever exposed, rotate it immediately through Coolify's environment variable management and redeploy, don't wait for a convenient moment. Document what was rotated and when in a way Olaflay can find later if the incident needs to be explained to the client.
