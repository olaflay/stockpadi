-- Prevent duplicate / multi-till close-day records for the same branch on the
-- same business date. A reconciliation record must be unique per
-- (business, branch, date): allowing multiple rows meant two managers (or a
-- double-tap on Save) could close the day twice, producing ambiguous history
-- with no indication of which record is authoritative, and no uniqueness to
-- stop re-closing after the fact.
--
-- Pre-launch schema (never applied against a live instance, per
-- docs/SCAFFOLD.md), so a unique constraint can be added without a
-- dedup/backfill step.
--
-- The existing index on (business_id, business_date) is kept for the common
-- "fetch a branch's history" query; the unique constraint below carries the
-- branch-specific guard.

alter table public.reconciliation_records
  drop constraint if exists reconciliation_records_branch_day_unique;

alter table public.reconciliation_records
  add constraint reconciliation_records_branch_day_unique
  unique (business_id, branch_id, business_date);

-- Aligned index for the constraint so Postgres can enforce it without a sort.
create index if not exists reconciliation_branch_day_unique_idx
  on public.reconciliation_records (business_id, branch_id, business_date);
