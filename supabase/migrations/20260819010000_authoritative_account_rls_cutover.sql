-- Forward-only authorization cutover. Historical role columns remain nullable
-- compatibility data; new authorization uses account context and membership.
alter table public.users alter column role drop not null;
alter table public.business_memberships alter column role drop not null;

create or replace function public.auth_branch_ids()
returns setof uuid language sql stable security definer set search_path = public
as $$
  select distinct ub.branch_id from public.user_branches ub
  where ub.user_id = auth.uid() and ub.business_id = public.auth_business_id();
$$;

create or replace function public.auth_can_access_business(p_business_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.auth_account_type() = 'ADMIN' or p_business_id = public.auth_business_id(); $$;

create or replace function public.auth_can_access_branch(p_business_id uuid, p_branch_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.auth_account_type() = 'ADMIN'
  or (p_business_id = public.auth_business_id()
      and (public.auth_account_type() = 'BUSINESS_OWNER'
           or p_branch_id in (select public.auth_branch_ids()))); $$;

comment on function public.auth_role() is
  'Deprecated compatibility helper. New policies use account type, membership, business and branch helpers.';

do $$ declare t text; p record;
begin
  foreach t in array array['branches','products','customers','expenses','suppliers','purchases','sales','stock_movements','customer_credit_movements','reconciliation_records'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
        execute format('drop policy if exists %I on public.%I', p.policyname, t);
      end loop;
      execute format('create policy authoritative_tenant_select on public.%I for select to authenticated using (auth_can_access_business(business_id))', t);
    end if;
  end loop;
end $$;

do $$ declare t text;
begin
  foreach t in array array['products','customers','expenses','suppliers','purchases','branches'] loop
    if to_regclass('public.' || t) is not null then
      execute format('create policy authoritative_owner_insert on public.%I for insert to authenticated with check (auth_account_type() in (''ADMIN'',''BUSINESS_OWNER'') and auth_can_access_business(business_id))', t);
      execute format('create policy authoritative_owner_update on public.%I for update to authenticated using (auth_account_type() in (''ADMIN'',''BUSINESS_OWNER'') and auth_can_access_business(business_id)) with check (auth_account_type() in (''ADMIN'',''BUSINESS_OWNER'') and auth_can_access_business(business_id))', t);
    end if;
  end loop;
end $$;

grant execute on function public.auth_branch_ids() to authenticated, service_role;
grant execute on function public.auth_can_access_business(uuid) to authenticated, service_role;
grant execute on function public.auth_can_access_branch(uuid, uuid) to authenticated, service_role;
