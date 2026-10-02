# Pending Tasks & Architectural Research Log

This document records forensic engineering research, architectural decisions, and queued pending tasks for OjàPadi. These items have been vetted and specced for upcoming execution so implementation can proceed cleanly without re-inventing solutions.

---

## Current Monorepo Baseline (Verified)

- **Launch Blockers (B1–B9)**: All 9 blockers closed and verified with automated tests.
- **Launch Scope Capabilities**: All 23 core capabilities in `docs/LAUNCH_SCOPE.md` stand at **100% VERIFIED**.
- **Automated Test Suite**: 99 test files, 538 tests passing across frontend, backend, and supabase layers (0 failures).
- **Synthetic Performance & 2G Benchmark**: Passing in `frontend/src/features/performance/__tests__/synthetic-profile.test.ts` (sub-15ms catalog query, sub-45ms search over 2,000 items, <80MB heap footprint under 5,000 products, 1,200ms 2G network simulation).

---

## Pending Task 1: $0/Month Enterprise Off-Site Backups via Cloudflare R2 & GitHub Actions

### 1.1 Context & Problem Statement
- **Financial Constraint**: Supabase Pro ($25/mo) + Point-in-Time Recovery ($100/mo) costs **$125/month** (~₦190,000/month). For a bootstrapping retail POS onboarding its first 1 to 6 branches, this is an unacceptable burn rate.
- **Storage Economics**:
  - 10,000 products: ~5 MB
  - 100,000 sales + line items: ~30 MB
  - 200,000 append-only stock movements: ~40 MB
  - Total for 1–6 retail shops for 18–24 months: **< 120 MB**.
  - Supabase Free Tier provides **500 MB** of Postgres storage (over 4x capacity needed for initial pilot and launch).

### 1.2 The $0/Month Architecture
Instead of paid vendor add-ons, off-site enterprise backups will run at **$0.00/month** using GitHub Actions and Cloudflare R2:

```
 [Supabase Free Postgres] 
         │ (Direct Connection via DATABASE_URL)
         ▼ (Nightly at 02:00 UTC via GitHub Action)
   [pg_dump --clean] ──► [AES-256 GPG Encryption] ──► [Cloudflare R2 Bucket]
                                                         • 10 GB Free Storage
                                                         • $0 Egress Fees Forever
                                                         • Rolling 30 Daily Snaps
                                                         • 12 Monthly Archives
```

1. **Automated Scheduled Workflow**: A `.github/workflows/database-backup.yml` workflow triggers on schedule (`cron: '0 2 * * *'`) and manual dispatch.
2. **Standard pg_dump**: Connects directly to PostgreSQL using repository secret `DATABASE_URL` (direct connection string).
3. **Client-Side Encryption**: Encrypts the snapshot using AES-256 (`gpg --symmetric --cipher-algo AES256`) with a passphrase stored in GitHub Secrets.
4. **Cloudflare R2 Storage**: Uploads the encrypted archive to Cloudflare R2 via AWS CLI / S3-compatible API. Cloudflare R2 provides 10 GB free storage forever with zero egress fees.
5. **Snapshot Retention**: Maintains 30 rolling daily snapshots and 12 monthly archives via an automatic prune script.
6. **Inactivity Ping**: The nightly workflow curls the backend health probe, preventing Supabase Free tier 7-day inactivity pausing.

### 1.3 Future Migration Strategy (Zero Vendor Lock-in)
Because OjàPadi's database layer uses standard PostgreSQL DDL, standard PostgreSQL RPC functions (`sync_apply_batch`, `void_sale`, `refund_sale`), and standard Postgres Row Level Security (RLS), the system is 100% portable:
- **Hetzner Cloud VPS Option**: **€3.79/month (~$4.20/mo)** for 40 GB NVMe SSD, 2 GB RAM, 20 TB traffic running self-hosted Postgres + Coolify or Docker.
- **Neon Serverless Option**: Free tier with instant copy-on-write branch restores.
- **Migration Procedure**: A standard 10-minute operation:
  ```bash
  pg_dump -Fc $SOURCE_DB_URL > backup.dump
  pg_restore --clean --if-exists -d $TARGET_DB_URL backup.dump
  ```

### 1.4 Pending Execution Checklist
- [ ] Create Cloudflare R2 bucket `ojapadi-backups` and generate S3 access credentials.
- [ ] Add GitHub repository secrets: `CF_R2_ACCOUNT_ID`, `CF_R2_ACCESS_KEY_ID`, `CF_R2_SECRET_ACCESS_KEY`, `BACKUP_ENCRYPTION_PASSPHRASE`.
- [ ] Implement `.github/workflows/database-backup.yml` with automated test run and verify encrypted artifact upload.
- [ ] Rehearse restore procedure against local PGlite test harness.

---

## Pending Task 2: Stranded Outbox Architecture & Owner Reconciliation Queue

### 2.1 Context & Retail Accounting Principles
- **Field Reality**: Cashier devices (low-end Android) may suffer shattered screens, hardware death, or extended disconnection (>14 days) while holding un-synced offline sales.
- **The Catastrophic Failure of Auto-Purging**:
  - Automatically deleting outbox mutations after 7 days violates Trust Standard Promises 1 and 2:
    - The physical cash drawer holds real cash from offline sales.
    - Physical goods were removed from shelves.
    - Silent deletion causes unexplainable drawer surpluses, false accusations of theft, and financial corruption.
- **Competitive Research**:
  - *Square POS*: Queues offline ledger events indefinitely; cash payments are pushed upon reconnect regardless of age.
  - *Shopify POS & Toast*: Provide store managers with a "Pending Offline Orders" and "Failed Transactions" review screen. Cash registers cannot execute an end-of-day close without acknowledging unsynced mutations.

### 2.2 The Professional Architecture: *Zero Silent Discard + Owner Reconciliation*

```
                       Cashier Device (Offline)
                  ┌─────────────────────────────────┐
                  │ 10 Sales recorded offline in    │
                  │ Dexie IndexedDB (db.outbox)     │
                  └───────────────┬─────────────────┘
                                  │
      ┌───────────────────────────┴───────────────────────────┐
      ▼                                                       ▼
Case A: Device Restores (Day 10)           Case B: Screen Cracked / Device Dying
  • Normal sync pushes all 10 sales           • Cashier taps "Emergency QR Export"
  • If version/price conflict occurs:         • Scans QR code with backup phone /
    surfaced to Owner Reconciliation Queue      OTG cable export to JSON
  • Zero cash discrepancy                     • Zero data lost with the broken device
```

1. **Principle of Zero Silent Discard**:
   - Outbox mutations (`sale`, `payment`, `credit`, `expense`) are **never silently deleted by a timer**.
   - Deduplication via `clientId` guarantees safe, idempotent replay even after extended offline periods.
2. **Cloud Device Heartbeat & Outbox Depth Tracker**:
   - Every active device reports its pending outbox count and battery/timestamp on periodic sync check-ins.
   - If a register has not connected in >48 hours and holds pending mutations, the Owner Dashboard renders an alert:
     > ⚠️ *Till 2 (Front Counter) has not checked in for 3 days. Last known pending: 4 sales (~₦18,500).*
3. **Owner Reconciliation Queue UI**:
   - Permanent failures (e.g. malformed data or deleted product references) or transactions with version conflicts surface in an **Owner Review Queue** (`Settings -> Data -> Reconciliation`).
   - Only a Business Owner (`ROLE_OWNER`) can tap **"Dismiss & Write Off"**.
   - Discarding requires entering an audit note and generates an immutable ledger record in `audit_logs` (`OUTBOX_MUTATION_DISCARDED`), permanently capturing the raw payload, cashier ID, and financial amount.
4. **Emergency Disaster Outbox Export (Zero Hardware Lock-In)**:
   - For dying hardware, cashiers can tap `Settings -> Data -> Emergency Outbox Export`.
   - Generates an encrypted JSON file or a sequence of dynamic QR codes.
   - Another device scans the QR codes or imports the JSON file, ingesting the un-synced outbox mutations and syncing them to the cloud.

### 2.3 Pending Execution Checklist
- [ ] Build `device_heartbeats` table in Supabase schema to track register ID, last seen timestamp, and pending mutation count.
- [ ] Add Owner Reconciliation Queue UI in `frontend/src/app/(app)/settings/data/reconciliation/page.tsx`.
- [ ] Implement `OUTBOX_MUTATION_DISCARDED` audit log action with mandatory reason input.
- [ ] Build Emergency QR / JSON outbox transfer mechanism in `frontend/src/features/sync/emergency-export.ts`.

---

## Pending Task 3: Low-End Android Hardware Pilot & Field Validation Protocol

### 3.1 Validation Objective
Per `.agents/rules/testing-and-qa.md`, before pilot deployment to Branch 1, the app must be verified on physical low-end Android hardware (2GB RAM, Android Go / Android 10+) on live throttled mobile networks.

### 3.2 Target Hardware Profile
- **RAM**: 2 GB (e.g., Tecno Pop 7 / itel A60 / Redmi A2 / Samsung Galaxy A03 Core).
- **Processor**: Unisoc SC9863A or MediaTek Helio A22 (quad-core / entry octa-core).
- **OS**: Android 11/12 Go Edition.
- **Browser**: Chrome Mobile 120+.
- **Network**: Throttled 2G/3G mobile data with simulated 500ms–1,500ms latency and intermittent packet drops.

### 3.3 Field Testing Test Matrix
1. **Cold Boot & PWA Install**: Verify service worker installation and app shell caching without network stalls.
2. **Offline POS Stress Run**: Complete 50 consecutive sales with cart items, order discounts, and parked sales in full offline mode (Airplane mode ON).
3. **Cold Restart**: Close browser, clear active RAM, reopen app offline, and verify cart/parked sale persistence and instant UI rendering (<50ms).
4. **Sync Drain on 2G Reconnect**: Disable Airplane mode on weak mobile signal; verify 50 sales drain via atomic `sync_apply_batch` without timeouts.
5. **Drawer & Report Audit**: Verify cash drawer total matches Close-Day summary and historical profit calculations.

---

## Summary of Completed vs Pending Scope

| Capability / Architecture | Status | Reference |
|---|---|---|
| **23 Launch Must-Haves** | **100% VERIFIED** | `docs/LAUNCH_SCOPE.md` |
| **All 9 Launch Blockers (B1–B9)** | **CLOSED & VERIFIED** | `docs/LAUNCH_SCOPE.md` |
| **Synthetic 2G / Low-RAM Benchmark** | **VERIFIED** | `frontend/src/features/performance/__tests__/synthetic-profile.test.ts` |
| **Cloudflare R2 $0 Backup Workflow** | **PENDING TASK** | Section 1 above |
| **Owner Reconciliation Queue UI** | **PENDING TASK** | Section 2 above |
| **Physical 2GB Android Field Pilot** | **PENDING TASK** | Section 3 above |
