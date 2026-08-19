# AGENTS.md — StockPadi

Read this file before touching any code. It is the single source of truth for what this project is, what is locked, and where to find the rule that governs whatever you are about to do. If something here conflicts with a request in a chat message, the conflict gets surfaced to Olaflay, not silently resolved either way.

## What this is

Offline-first inventory and point-of-sale PWA, built for retail businesses (1 to 6 branches). Deployed on a multi-tenant shared database architecture, designed so onboarding new clients requires zero infrastructure changes—just a new business profile. Full product context lives in the PRD at `docs/PRD.md`.

## Docs index

| File | What it is |
|---|---|
| `README.md` | Setup and day-to-day dev commands |
| `docs/PRD.md` | The product requirements doc: users, journeys, functional/non-functional requirements, architecture, milestones |
| `docs/SCAFFOLD.md` | Log of the initial scaffold: what was built, why, verification performed, known gaps |

## Stack

Next.js (PWA) + React + TypeScript, Dexie.js over IndexedDB for local storage, Workbox for service worker and background sync, Supabase Cloud (Postgres, Auth, Realtime, Storage, Edge Functions) as the managed backend, deployed via Pxxl (git-push deploys from GitHub). That choice is explained and locked in `.agents/rules/hosting-and-deployment.md`, do not silently reintroduce a different hosting platform because it seems simpler mid-build.

## Locked decisions (do not silently override any of these)

1. Stock quantity and customer credit balance are computed from an append-only `stock_movements` ledger. There is no mutable "current quantity" field to update directly. Full rule: `.agents/rules/offline-sync-and-ledger.md`.
2. This is a multi-tenant database architecture. Every core table is scoped by a `business_id`. Postgres Row Level Security (RLS) is strictly responsible for isolating tenant data securely, as well as enforcing internal role-based access control. Full rule: `.agents/rules/database-and-rls.md`.
3. Payment method is recorded as a tag (cash, transfer, POS terminal, credit). The app never processes, stores, or transmits live card or wallet payment data. Full rule: `.agents/rules/payment-and-pci-scope.md`.
4. Refunds and voids require an online connection. Never build an offline path for either, even if asked, without surfacing the conflict first.
5. Design system lead is Samsung One UI (one-handed, thumb-reach layout), borrowing Meta's data-lite discipline for low-end Android on weak connections. Full rule: `.agents/rules/design-system.md`.
6. Hosting is the Next.js app on Pxxl plus Supabase Cloud (managed) as the backend. Full rule: `.agents/rules/hosting-and-deployment.md`.
7. The codebase must stay forkable for a future client without a rewrite: branding, business-type defaults, and credentials live in configuration, never hardcoded. Full rule: `.agents/rules/reusability-and-multi-client.md`.

## Rules index (`.agents/rules/`)

| File | Governs |
|---|---|
| `offline-sync-and-ledger.md` | The delta-merge ledger, conflict resolution per entity, what must never become a mutable field |
| `database-and-rls.md` | Schema conventions, single-tenant RLS by role, migration discipline |
| `hosting-and-deployment.md` | Pxxl app hosting plus Supabase Cloud, backups, secrets, why this over the previous self-hosted VPS plan |
| `payment-and-pci-scope.md` | The payment-method-as-tag boundary, what to do if asked to add real payment processing |
| `design-system.md` | Samsung One UI lead system, Meta data-lite borrowing, tokens, the screen-state checklist |
| `testing-and-qa.md` | What must have an automated test before merge, especially ledger and sync logic |
| `coding-standards-and-api.md` | TypeScript conventions, file structure, PostgREST and Edge Function API conventions |
| `reusability-and-multi-client.md` | The config-boundary discipline that keeps a second deployment a fork, not a rewrite |
| `company-os/` | Multi-department review process for any major feature or architecture decision |
| `zero-ai-slop-design.md` | The full design and copy standard `design-system.md` is built on top of |
| `trusted-tool-finder.md` | How to research any new tool, library, or service before adding it |
| `performance-and-scalability.md` | Standards for keeping the app fast under large database sizes (5,000+ products) |

## Skills index (`.agents/skills/`)

Procedural playbooks for recurring build tasks. Read the relevant one before starting the task named, do not improvise a different approach to something that already has a playbook.

| File | Use when |
|---|---|
| `scaffold-new-screen.md` | Building any new screen |
| `add-stock-movement-type.md` | Adding a new source of stock change (new adjustment reason, new sale type) |
| `add-new-report.md` | Adding a new report to Reports |
| `write-offline-conflict-test.md` | Writing the required two-device concurrent-write test for any change touching the ledger |
| `write-edge-function.md` | Adding or modifying an Edge Function |
| `add-business-type-template.md` | Adding a new business-type default (beyond Grocery, Pharmacy, Electronics, General Retail) |
| `fork-for-new-client.md` | Standing up a second client deployment from this codebase |
| `pxxl-deploy-and-backup-check.md` | Deploying to or verifying the health of the Pxxl/Supabase Cloud hosting |

## If something isn't covered here

Declare the gap out loud rather than guessing. State what's missing, propose the smallest reasonable rule to cover it, and confirm before treating that proposal as locked. This mirrors the standing rule already governing every Olaflay build: evidence-based, not invented from confidence.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
