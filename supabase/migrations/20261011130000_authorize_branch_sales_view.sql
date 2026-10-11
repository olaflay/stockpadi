-- Let a worker with explicit receipt and branch-sales access view completed
-- sales from assigned branches. Own-sales access remains unchanged for workers
-- without VIEW_BRANCH_SALES.

alter table public.worker_permissions
  drop constraint if exists worker_permissions_permission_check;

alter table public.worker_permissions
  add constraint worker_permissions_permission_check check (permission in (
    'POS_SELL', 'VIEW_PRODUCTS', 'VIEW_BRANCH_STOCK', 'VIEW_STOCK_MOVEMENTS',
    'SUBMIT_STOCK_COUNT', 'SUBMIT_RECONCILIATION', 'VIEW_CUSTOMERS',
    'USE_CUSTOMER_CREDIT', 'VIEW_OWN_SALES', 'VIEW_BRANCH_SALES', 'VIEW_RECEIPTS',
    'VIEW_ALERTS', 'RECEIVE_STOCK', 'RECORD_REPAYMENT', 'VIEW_BRANCH_RECONCILIATION',
    'CREATE_CUSTOMERS', 'MANAGE_PRODUCTS', 'ADJUST_STOCK', 'MANAGE_EXPENSES',
    'VIEW_REPORTS', 'MANAGE_BRANCHES', 'MANAGE_BRANCH_WORKERS'
  ));

insert into public.worker_permissions (user_id, business_id, permission, enabled)
select wp.user_id, wp.business_id, 'VIEW_BRANCH_SALES', true
from public.worker_permissions wp
where wp.permission = 'VIEW_OWN_SALES'
  and wp.enabled = true
  and exists (
    select 1
    from public.worker_permissions receipts
    where receipts.user_id = wp.user_id
      and receipts.business_id = wp.business_id
      and receipts.permission = 'VIEW_RECEIPTS'
      and receipts.enabled = true
  )
on conflict (user_id, business_id, permission) do nothing;

drop policy if exists authoritative_tenant_select on public.sales;
create policy authoritative_tenant_select on public.sales
  for select to authenticated using (
    (
      public.auth_account_type() in ('ADMIN', 'BUSINESS_OWNER')
      and public.auth_can_access_business(business_id)
    )
    or (
      public.auth_account_type() = 'WORKER'
      and business_id = public.auth_business_id()
      and branch_id in (select public.auth_branch_ids())
      and public.auth_worker_has_capability('VIEW_RECEIPTS')
      and (
        (
          created_by_user_id = auth.uid()
          and public.auth_worker_has_capability('VIEW_OWN_SALES')
        )
        or public.auth_worker_has_capability('VIEW_BRANCH_SALES')
      )
    )
  );

comment on policy authoritative_tenant_select on public.sales is
  'Workers see sales only in assigned branches and only with receipt access. VIEW_BRANCH_SALES expands the existing own-sales view to the assigned branch.';

create or replace function public.auth_can_receive_sync_topic(topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_branch_id uuid;
  v_match text[];
  v_account_type text;
begin
  v_match := regexp_match(topic, '^sync:business:([0-9a-fA-F-]{36})(:branch:([0-9a-fA-F-]{36}))?$');
  if v_match is null or auth.uid() is null then
    return false;
  end if;

  v_business_id := v_match[1]::uuid;
  v_branch_id := nullif(v_match[3], '')::uuid;
  v_account_type := public.auth_account_type();

  if not exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.business_id = v_business_id
      and u.is_active = true
  ) then
    return false;
  end if;

  if v_account_type = 'BUSINESS_OWNER' then
    return public.auth_can_access_business(v_business_id)
      and (v_branch_id is null or public.auth_can_access_branch(v_business_id, v_branch_id));
  end if;

  if v_account_type = 'WORKER' and v_branch_id is not null then
    return public.auth_can_access_branch(v_business_id, v_branch_id)
      and (
        public.auth_worker_has_capability('VIEW_PRODUCTS')
        or public.auth_worker_has_capability('VIEW_BRANCH_STOCK')
        or public.auth_worker_has_capability('VIEW_CUSTOMERS')
        or public.auth_worker_has_capability('VIEW_OWN_SALES')
        or public.auth_worker_has_capability('VIEW_BRANCH_SALES')
        or public.auth_worker_has_capability('VIEW_STOCK_MOVEMENTS')
        or public.auth_worker_has_capability('RECEIVE_STOCK')
        or public.auth_worker_has_capability('MANAGE_EXPENSES')
      );
  end if;

  return false;
end;
$$;

revoke execute on function public.auth_can_receive_sync_topic(text) from public, anon;
grant execute on function public.auth_can_receive_sync_topic(text) to authenticated, service_role;
