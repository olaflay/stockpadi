# OjàPadi — Documentation System (Diátaxis Architecture)

The single entry point for OjàPadi product architecture, technical specifications, operational runbooks, and engineering backlog.

Structured in accordance with the **Diátaxis Documentation Framework** (Tutorials, How-To Guides, Reference, and Explanation) and governed by the **TRUST Standard** (`.agents/rules/trust-standard.md`).

---

## 1. Documentation Map (Diátaxis)

```
                     PRACTICAL KNOWLEDGE
                              ▲
                              │
            HOW-TO GUIDES     │     TUTORIALS
       (Problem-oriented)     │   (Learning-oriented)
                              │
                              │   • specs/activation-onboarding.md
• PWA-UPDATE-VERIFICATION.md  │   • specs/coach-marks.md
• products-import-template    │
                              │
──────────────────────────────┼──────────────────────────────►
                              │                     THEORETICAL
          REFERENCE           │    EXPLANATION      KNOWLEDGE
    (Information-oriented)    │  (Understanding-oriented)
                              │
• LAUNCH_SCOPE.md             │   • PRD.md (Concept & Trust)
• COSTING-AND-PRICING.md      │   • adr/0001-canonical-application-flow.md
• ROADMAP-AND-BACKLOG.md      │   • complete-improvement-audit.md
• CLIENT-SERVER-COMPATIBILITY │
• REBRANDING-PLAN.md          │
• specs/README.md             │
                              ▼
```

### 1.1 Reference (Information-Oriented / Technical Specifications)

| Document | Scope & Authority | When to Consult |
|---|---|---|
| [LAUNCH_SCOPE.md](LAUNCH_SCOPE.md) | **The frozen Must / V1.1 / Future boundary**, with all 23 core capabilities classified against executed verification. | **Before starting any feature work.** Decides whether a capability is in scope. |
| [COSTING-AND-PRICING.md](COSTING-AND-PRICING.md) | The costing law (moving weighted average cost, snapshotted at sale, IAS 2 compliant) and customer pricing rules. | Working on profit calculations, inventory valuations, or financial displays. |
| [ROADMAP-AND-BACKLOG.md](ROADMAP-AND-BACKLOG.md) | **Master product roadmap, commercial subscription tiers (Free/Pro/Enterprise), architectural backlog, and AI constitution.** | Reviewing upcoming sprints, Cloudflare R2 backup spec, cashier shift sessions, or AI automation. |
| [CLIENT-SERVER-COMPATIBILITY.md](CLIENT-SERVER-COMPATIBILITY.md) | API versioning contract (`X-Client-Version`, `X-Min-Client-Version`), outbox schema v1, and rolling migration changelog. | Modifying API request/response payloads or outbox schemas. |
| [REBRANDING-PLAN.md](REBRANDING-PLAN.md) | Master rebrand specification and pointer to the zero-hardcoding law (`.agents/rules/reusability-and-multi-client.md`). | Adding any UI copy, brand token, or forkable configuration. |
| [specs/](specs/README.md) | Active feature specification index: Units Model, Contacts Hub, Hub Dashboard, and Stock Count redesign. | Implementing specced roadmap features. |

### 1.2 Explanation (Understanding-Oriented / Architecture & Principles)

| Document | Scope & Authority | When to Consult |
|---|---|---|
| [PRD.md](PRD.md) | Authoritative Product Requirements Document: user journeys, data model, multi-tenant database scoping, and **Section 8.1 TRUST Standard**. | Understanding product vision, tenant permissions, and non-negotiables. |
| [adr/0001-canonical-application-flow.md](adr/0001-canonical-application-flow.md) | **ADR 0001:** Canonical browser-to-database flow, single-flight coordinator, same-origin Node API gateway, and Postgres authority. | Modifying client-server transport, service worker scope, or data layers. |
| [complete-improvement-audit.md](complete-improvement-audit.md) | Master improvement audit: Keep/Reject/Remove feature evaluations, minimalism doctrine (Google Photos/Drive), and performance budgets. | Evaluating UX flows, proposed features, or screen density. |

### 1.3 How-To Guides (Problem-Oriented / Runbooks & Procedures)

| Document | Scope & Authority | When to Consult |
|---|---|---|
| [PWA-UPDATE-VERIFICATION.md](PWA-UPDATE-VERIFICATION.md) | Manual verification checklist for PWA service worker updates, pending offline sales across reload, and form draft recovery. | Pre-release testing, PWA deployment validation, or update debugging. |
| [products-import-template.xlsx](products-import-template.xlsx) | Standard Excel spreadsheet format for merchant catalog import. | Testing or onboarding merchant inventory bulk imports. |

### 1.4 Tutorials (Learning-Oriented / Activation & Onboarding)

| Document | Scope & Authority | When to Consult |
|---|---|---|
| [specs/activation-onboarding.md](specs/activation-onboarding.md) | 4-step merchant onboarding walk (catalog prefill, first product, airplane-mode sale). | Refining activation rates and first-time merchant experience. |
| [specs/coach-marks.md](specs/coach-marks.md) | Dismissible first-visit highlights guiding cashiers through POS, stock counting, and reports. | Designing contextual first-visit user guidance. |

---

## 2. Archive & Provenance

Historical build logs, resolved point-in-time boundary audits, and completed implementation blueprints are archived in [archive/](archive/README.md):

- [archive/ARCHITECTURE-AUDIT.md](archive/ARCHITECTURE-AUDIT.md) — 2026-10-07 architecture audit (ratified into ADR 0001).
- [archive/SYNC-REPAIR-AUDIT.md](archive/SYNC-REPAIR-AUDIT.md) — 2026-10-07 sync defect repair audit (verified in test suites).
- [archive/SCAFFOLD.md](archive/SCAFFOLD.md) — Initial August 2026 scaffold log.
- [archive/SUSTAINABILITY-AND-EXPERIENCE-BLUEPRINT.md](archive/SUSTAINABILITY-AND-EXPERIENCE-BLUEPRINT.md) — Completed Phase 1–3 & §9/§11 blueprint.
- [archive/BACKEND-SPLIT.md](archive/BACKEND-SPLIT.md) — Deployment topology scratchpad.
- [archive/SYNC-DEPLOYMENT.md](archive/SYNC-DEPLOYMENT.md) — Historical deployment checklist.
- [archive/ENVIRONMENT-MATRIX.md](archive/ENVIRONMENT-MATRIX.md) — Environment identity scratchpad.

---

## 3. Governance Laws

Every human and automated agent working in this repository is strictly bound by:

1. **The TRUST Standard** (`.agents/rules/trust-standard.md` & `PRD.md` §8.1): Reliability outranks feature count. Known open defects block new feature work.
2. **The Zero-Hardcoding Law** (`.agents/rules/reusability-and-multi-client.md`): Brand names, business names, currency glyphs, and support copy must resolve from configuration, never from literals.
3. **Single Source of Truth**: When documentation conflicts with code, resolve to the canonical living documents above and update test evidence.
