-- Split out from 20260809130000_super_admin.sql: Postgres refuses to use a
-- newly added enum value in the same transaction that added it ("unsafe use
-- of new value" error). Any migration runner that wraps a file in an
-- implicit transaction (most do, including `supabase db push` and the
-- pglite test harness) would fail to apply the original file at all, since
-- it both added 'super_admin' to app_role and used it (in a policy
-- predicate function body and an INSERT) in the same statement batch. The
-- enum addition now lands as its own migration, committed on its own,
-- before anything references the value.

ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'super_admin';
