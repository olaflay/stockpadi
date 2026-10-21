# Archive — OjàPadi Historical Audit & Build Artifacts

This directory contains point-in-time audit reports, initial scaffolding logs, and superseded operational scratchpads.

## Governance & Immutability Notice
Documents in this directory are preserved strictly for historical audit trail and forensic provenance (e.g. citations in historical SQL migrations and Git commit history). **They are NOT living specifications.**

For active, authoritative architectural and operational guidance, consult the canonical living documents in `docs/` and `.agents/rules/`.

## Archived Artifacts Index

| Archived File | Original Date | Original Purpose | Current Living Authority |
|---|---|---|---|
| `ARCHITECTURE-AUDIT.md` | 2026-10-07 | Point-in-time boundary & transport audit | `docs/adr/0001-canonical-application-flow.md`, `AGENTS.md` |
| `SYNC-REPAIR-AUDIT.md` | 2026-10-07 | Point-in-time outbox & sync defect repair report | `docs/adr/0001-canonical-application-flow.md`, `.agents/rules/offline-sync-and-ledger.md` |
| `SCAFFOLD.md` | 2026-08-07 | Initial scaffold build log | `AGENTS.md`, `README.md`, `docs/PRD.md` |
| `SUSTAINABILITY-AND-EXPERIENCE-BLUEPRINT.md` | 2026-09-04 | Completed Phase 1–3 & §9/§11 feature implementation blueprint | Verified in codebase; active UX rules in `.agents/rules/design-system.md` |
| `BACKEND-SPLIT.md` | 2026-10-07 | Frontend/backend deployment split scratchpad | `docs/adr/0001-canonical-application-flow.md`, `AGENTS.md` |
| `SYNC-DEPLOYMENT.md` | 2026-09-18 | Migration deployment order scratchpad | `.agents/skills/vercel-deploy-and-backup-check.md`, `docs/adr/0001-canonical-application-flow.md` |
| `ENVIRONMENT-MATRIX.md` | 2026-10-07 | Multi-environment identity scratchpad | `packages/contracts/src/environment-contract.json`, `.env.example` files |
