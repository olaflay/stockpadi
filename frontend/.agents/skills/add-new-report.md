---
name: add-new-report
description: Use this when adding a new report to the Reports module (a new time period, a new breakdown, a new metric), to keep it consistent with per-branch and consolidated reporting and with the offline-cache-first rendering pattern.
---

# Adding a New Report

## Two views, always

Every report supports a single-branch view and a consolidated across-all-branches view for roles that can see multiple branches (Owner, Manager, Accountant, Admin, per the permission matrix in `.agents/rules/database-and-rls.md`). Do not build a report that only works for one branch at a time and bolt on consolidation later, decide the aggregation logic up front, it usually changes the query shape.

## Query against the ledger, not a cached total, for anything stock-related

Any report touching stock value, stock movement, or shrinkage reads from `stock_movements`, computed at query time or via a maintained aggregate, never from a value that could have drifted from the ledger. This keeps every report consistent with the actual source of truth described in `.agents/rules/offline-sync-and-ledger.md`.

## Rendering

Reports render progressively from whatever is already synced in IndexedDB, then refresh as newer data arrives, rather than blocking on a single large query before showing anything. A report screen with no data yet visible for several seconds is a UX failure on a 2G connection, per `.agents/rules/design-system.md`'s bandwidth requirement.

## Definition of done for a new report

State the time period options it supports (daily, weekly, monthly, custom), whether it's single-branch or consolidated by default, and confirm it degrades gracefully with partial sync data (a device that's been offline for two days should still show something useful for the data it has, not a blank screen waiting for a full resync).
