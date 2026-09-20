-- Worker lifecycle metadata.
-- Deactivation is reversible for 30 days. After that the login is retired,
-- while the user tombstone remains so historical rows keep their author id.

alter table public.users
  add column if not exists email text,
  add column if not exists deactivated_at timestamptz,
  add column if not exists permanently_deleted_at timestamptz;

-- Existing auth users are the source of truth for the initial backfill.
update public.users u
set email = lower(a.email)
from auth.users a
where a.id = u.id
  and u.email is null
  and a.email is not null;

-- Legacy inactive workers receive a fresh 30-day window from this migration
-- instead of being removed unexpectedly on first use.
update public.users
set deactivated_at = coalesce(deactivated_at, now())
where account_type = 'WORKER'
  and is_active = false
  and permanently_deleted_at is null;

create unique index if not exists users_email_lower_unique_idx
  on public.users (lower(email))
  where email is not null;

create index if not exists users_worker_deactivation_idx
  on public.users (business_id, deactivated_at)
  where account_type = 'WORKER' and is_active = false and permanently_deleted_at is null;

comment on column public.users.email is
  'Login email mirror used for tenant-safe worker lifecycle checks. Auth remains the login authority.';
comment on column public.users.deactivated_at is
  'When a worker was deactivated. Reactivation is allowed for 30 days.';
comment on column public.users.permanently_deleted_at is
  'When the worker login was retired after the deactivation retention window; the tombstone preserves historical foreign keys.';
