create table if not exists public.reconciliation_records (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profile(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  actor_user_id uuid not null references public.users(id),
  business_date date not null,
  expected_cash numeric(14,2) not null default 0,
  expected_transfer numeric(14,2) not null default 0,
  expected_pos numeric(14,2) not null default 0,
  expected_credit numeric(14,2) not null default 0,
  actual_cash numeric(14,2) not null,
  discrepancy numeric(14,2) not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists reconciliation_business_date_idx on public.reconciliation_records(business_id, business_date desc);
alter table public.reconciliation_records enable row level security;
drop policy if exists reconciliation_select on public.reconciliation_records;
drop policy if exists reconciliation_insert on public.reconciliation_records;
create policy reconciliation_select on public.reconciliation_records for select to authenticated using (business_id = auth_business_id() or is_platform_admin());
create policy reconciliation_insert on public.reconciliation_records for insert to authenticated with check (business_id = auth_business_id() and actor_user_id = auth.uid());
grant select, insert on public.reconciliation_records to authenticated;
grant all on public.reconciliation_records to service_role;
