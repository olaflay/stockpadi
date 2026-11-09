# Offline and sync incident runbook

Use this for: endless startup, offline browser error, growing unsaved queue, repeated conflicts, client-version rejection, corrupt local cache, failed deployment, or restore event.

## First response

1. Stop feature deployment. Record environment, build, browser/PWA mode, device, business and branch IDs, first observed time and affected workflows. Do not collect sale payloads, customer details, tokens or passwords.
2. Preserve the device. Do not clear site data, uninstall, delete IndexedDB, or tell the merchant to recreate transactions.
3. Export the support-safe Sync Health snapshot. Record pending count, oldest age, last push/pull status, HTTP/error codes, session/batch IDs, client version and storage state.
4. Classify scope: one device, one tenant, one build, one API region, or all users.

## Availability recovery

- Bad frontend/backend deployment: use Vercel deployment rollback, then verify `/sw.js` and build compatibility. Do not activate an older client if the server minimum version rejects it.
- Worker/cache incident: deploy a forward fix with compatible chunks and cache cleanup. Do not ask users to clear data while outbox rows are pending.
- API/database outage: keep local sales enabled when the safety policy permits; refunds and voids remain unavailable. Communicate that records are saved on the device, not backed up yet.
- One-device database block: close duplicate app tabs/windows and retry the bounded database recovery. Preserve all stores.

## Data recovery

- Never roll the production database backward to repair application code.
- For disaster restore, restore the selected backup into a separate project first. Verify schema head, functions, RLS, tenant counts and ledger invariants.
- Before cutover, inventory device outboxes created after the restore point. Reconcile through the idempotent API; never import ledger totals as mutable balances.
- Validate stock and debt by replaying append-only movements, and validate historical sales against immutable cost snapshots.

## Closeout evidence

- Root cause and failure window.
- Number of affected devices/tenants and oldest pending mutation.
- Exact rollback/forward-fix deployment.
- Reconciliation counts: applied, duplicate/skipped, blocked, conflict, quarantine.
- Test that now reproduces the failure.
- Achieved recovery time and possible data-loss window.
- Follow-up owner and deadline.
