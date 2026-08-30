# StockPadi — Documentation Index

The single entry point for StockPadi product architecture, specifications, improvement audits, and operational guides.

---

## 1. Core Documentation Map

| Document | Purpose | When to Consult |
|---|---|---|
| [PRD.md](PRD.md) | The authoritative product requirements document: users, journeys, offline-first data model, single-tenant database scoping, payment-as-tag boundary. | Understanding high-level product architecture, permissions, and non-negotiables. |
| [SCAFFOLD.md](SCAFFOLD.md) | Technical build log: directory tree structure, data layer, hooks, and verification checklists. | Working on the codebase and navigating component layers. |
| [complete-improvement-audit.md](complete-improvement-audit.md) | Master improvement audit: prioritized evaluation of features (keep/build/remove/reject), doctrines on minimalism, performance, and data-lite design. | Planning roadmap improvements or auditing UX. |
| [improvements/](improvements/) | Deep-dive design briefs: Growth Onboarding (`02`), Multi-Channel Reconciliation (`03`), Brand Identity & Design System (`04`). | Understanding design rationale and architectural blueprints for specific features. |
| [specs/](specs/README.md) | Specification Index: implementation status (shipped vs next up) for Units Model, Contacts Hub, Hub Dashboard, Stock Count Redesign, and Coach Marks. | Building or reviewing upcoming specced features. |

---

## 2. Directory Governance

- **Single Source of Truth:** `PRD.md` and `complete-improvement-audit.md` govern product rules.
- **Implemented Specs:** Kept updated in `specs/README.md` with explicit test verification references.
- **Zero Artifact Bloat:** Scratch research files are consolidated and removed once features transition into production code.
