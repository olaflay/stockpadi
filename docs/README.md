# OjàPadi — Documentation Index

The single entry point for OjàPadi product architecture, specifications, improvement audits, and operational guides.

---

## 1. Core Documentation Map

| Document | Purpose | When to Consult |
|---|---|---|
| [PRD.md](PRD.md) | The authoritative product requirements document: users, journeys, offline-first data model, single-tenant database scoping, payment-as-tag boundary. **Section 8.1 carries the TRUST standard as a product requirement.** | Understanding high-level product architecture, permissions, and non-negotiables. |
| [LAUNCH_SCOPE.md](LAUNCH_SCOPE.md) | **The frozen Must / V1.1 / Future boundary**, with every capability classified against real evidence and the nine open launch blockers named. | **Before starting any feature work.** This is what decides whether a task is in scope. |
| [COSTING-AND-PRICING.md](COSTING-AND-PRICING.md) | The costing decision (moving weighted average, immutably snapshotted) and the customer pricing decision, with citations. | Working on profit, margin, cost, or anything that puts a number in front of an owner. |
| [SCAFFOLD.md](SCAFFOLD.md) | Technical build log: directory tree structure, data layer, hooks, and verification checklists. | Working on the codebase and navigating component layers. |
| [BUSINESS-MODEL-AND-ROADMAP.md](BUSINESS-MODEL-AND-ROADMAP.md) | Plan tiers, phased feature value, and scaling economics. | Evaluating commercial scope and roadmap sequencing. |
| [complete-improvement-audit.md](complete-improvement-audit.md) | Master improvement audit: prioritized evaluation of features (keep/build/remove/reject), doctrines on minimalism, performance, and data-lite design. | Planning roadmap improvements or auditing UX. |
| [specs/](specs/README.md) | Specification Index: implementation status (shipped vs next up) for Units Model, Contacts Hub, Hub Dashboard, Stock Count Redesign, and Coach Marks. | Building or reviewing upcoming specced features. |
| [../questions.md](../questions.md) | Open findings and decisions still requiring the owner's answer. | When something is unresolved and you need to know what is already known. |

---

## 2. Governance

The rules that govern this codebase live in `../AGENTS.md` and `.agents/rules/` at the repository
root, not here. Two of them gate all other work:

- **The TRUST standard** (`.agents/rules/trust-standard.md`) is a gate, not a values statement.
  Reliability outranks feature count, and an open reliability defect blocks new feature work.
- **The zero-hardcoding law** (`.agents/rules/reusability-and-multi-client.md`) keeps the codebase
  white-label. Brand names, currency symbols, and company copy resolve from config or environment,
  never from literals in UI or logic.

## 3. Directory Governance

- **Single Source of Truth:** `PRD.md` and `LAUNCH_SCOPE.md` govern product rules and scope.
- **Implemented Specs:** Kept updated in `specs/README.md` with explicit test verification references.
- **Zero Artifact Bloat:** Scratch research files are consolidated and removed once features transition into production code.

