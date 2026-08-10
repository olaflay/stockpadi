-- suppliers.balance was a mutable numeric column, never written to by any
-- application code (no supplier-payment feature exists yet) — but it sat
-- there as a landmine identical to the exact anti-pattern
-- .agents/rules/offline-sync-and-ledger.md warns against ("if you find
-- yourself writing UPDATE ... SET quantity = quantity - 1... stop"). Every
-- other balance in this schema (stock, customer credit) is ledger-derived
-- via an append-only movements table + view. Dropping the unused mutable
-- column now, before a future supplier-payment feature is tempted to build
-- on top of it as a stored total instead of a ledger.

alter table suppliers drop column if exists balance;
