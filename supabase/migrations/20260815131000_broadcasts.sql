-- Online-only broadcasts. No offline queue or business ledger involvement.
create table if not exists public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('platform', 'business')),
  business_id uuid references public.business_profile(id) on delete cascade,
  content text not null check (length(trim(content)) > 0),
  priority integer not null default 0,
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  start_at timestamptz not null default now(),
  end_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint broadcasts_scope_business_check check ((scope = 'platform' and business_id is null) or (scope = 'business' and business_id is not null))
);

alter table public.broadcasts enable row level security;
grant select on public.broadcasts to authenticated;
grant insert, update, delete on public.broadcasts to authenticated;

create policy broadcasts_active_select on public.broadcasts for select to authenticated using (
  status = 'published' and start_at <= now() and (end_at is null or end_at > now())
  and (scope = 'platform' or business_id = auth_business_id())
);
create policy broadcasts_platform_manage on public.broadcasts for all to authenticated using (is_platform_admin()) with check (is_platform_admin() and scope = 'platform' and business_id is null);
create policy broadcasts_owner_manage on public.broadcasts for all to authenticated using (scope = 'business' and business_id = auth_business_id() and auth_role() = 'owner') with check (scope = 'business' and business_id = auth_business_id() and auth_role() = 'owner');
