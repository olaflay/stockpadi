-- A manager is a worker capability/assignment, never a second owner.
alter table public.user_branches add column if not exists is_manager boolean not null default false;
create index if not exists user_branches_manager_idx on public.user_branches (business_id, branch_id) where is_manager = true;
