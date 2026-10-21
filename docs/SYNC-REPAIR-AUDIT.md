# Sync Repair Audit (Archived Pointer)

> **Status:** Archived point-in-time audit artifact.  
> **Archive Location:** [docs/archive/SYNC-REPAIR-AUDIT.md](archive/SYNC-REPAIR-AUDIT.md)  
> **Current Living Rules:** [docs/adr/0001-canonical-application-flow.md](adr/0001-canonical-application-flow.md) and `.agents/rules/offline-sync-and-ledger.md`

This document records the 2026-10-07 sync repairs (liveness, cross-tab safety, bounded jitter, and outbox durability). All repaired invariants are actively tested and verified in `frontend/src/features/sync/` and `backend/src/modules/sync/`.
