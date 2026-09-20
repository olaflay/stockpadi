-- Make worker capability assignment authoritative for direct authenticated reads.
-- The Node API remains the business write boundary; these policies are defense
-- in depth for any client that talks to PostgREST with a user session.

-- The older capability migrations inserted a broad starter set for every worker.
-- Those rows cannot be distinguished from later owner-selected grants, so the
-- cutover resets worker grants once. Owners must explicitly save the intended
-- capabilities for existing workers after applying this migration.
delete from public.worker_permissions wp
using public.business_memberships m
where m.user_id = wp.user_id
  and m.business_id = wp.business_id
  and m.account_type = 'WORKER';

do $$
begin
  alter table public.worker_permissions
    add constraint worker_permissions_permission_check check (permission in (
      'POS_SELL', 'VIEW_PRODUCTS', 'VIEW_BRANCH_STOCK', 'VIEW_STOCK_MOVEMENTS',
      'SUBMIT_STOCK_COUNT', 'SUBMIT_RECONCILIATION', 'VIEW_CUSTOMERS',
      'USE_CUSTOMER_CREDIT', 'VIEW_OWN_SALES', 'VIEW_RECEIPTS', 'VIEW_ALERTS',
      'RECEIVE_STOCK', 'RECORD_REPAYMENT', 'VIEW_BRANCH_RECONCILIATION',
      'CREATE_CUSTOMERS', 'MANAGE_PRODUCTS', 'ADJUST_STOCK', 'MANAGE_EXPENSES',
      'VIEW_REPORTS', 'MANAGE_BRANCHES', 'MANAGE_BRANCH_WORKERS'
    ));
exception when duplicate_object then null;
end $$;

create or replace function public.auth_worker_has_capability(p_permission text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.auth_account_type() = 'BUSINESS_OWNER'
    or (
      public.auth_account_type() = 'WORKER'
      and exists (
        select 1
        from public.worker_permissions wp
        where wp.user_id = auth.uid()
          and wp.business_id = public.auth_business_id()
          and wp.enabled = true
          and (
            wp.permission = p_permission
            or (p_permission = 'VIEW_PRODUCTS' and wp.permission in ('POS_SELL', 'MANAGE_PRODUCTS', 'ADJUST_STOCK', 'SUBMIT_STOCK_COUNT', 'RECEIVE_STOCK'))
            or (p_permission = 'VIEW_BRANCH_STOCK' and wp.permission in ('POS_SELL', 'ADJUST_STOCK', 'SUBMIT_STOCK_COUNT', 'RECEIVE_STOCK'))
            or (p_permission = 'VIEW_STOCK_MOVEMENTS' and wp.permission in ('MANAGE_PRODUCTS', 'ADJUST_STOCK'))
            or (p_permission = 'VIEW_CUSTOMERS' and wp.permission in ('USE_CUSTOMER_CREDIT', 'CREATE_CUSTOMERS', 'RECORD_REPAYMENT'))
          )
      )
    );
$$;

-- Branches are business-wide for owners, but workers only see assigned branches.
drop policy if exists authoritative_tenant_select on public.branches;
create policy authoritative_tenant_select on public.branches
  for select to authenticated using (
    public.auth_account_type() in ('ADMIN', 'BUSINESS_OWNER')
    and public.auth_can_access_business(business_id)
    or (
      public.auth_account_type() = 'WORKER'
      and business_id = public.auth_business_id()
      and id in (select public.auth_branch_ids())
    )
  );

drop policy if exists authoritative_tenant_select on public.products;
create policy authoritative_tenant_select on public.products
  for select to authenticated using (
    public.auth_account_type() in ('ADMIN', 'BUSINESS_OWNER')
    and public.auth_can_access_business(business_id)
    or (
      business_id = public.auth_business_id()
      and public.auth_worker_has_capability('VIEW_PRODUCTS')
    )
  );

drop policy if exists authoritative_tenant_select on public.categories;
create policy authoritative_tenant_select on public.categories
  for select to authenticated using (
    public.auth_account_type() in ('ADMIN', 'BUSINESS_OWNER')
    and public.auth_can_access_business(business_id)
    or (
      business_id = public.auth_business_id()
      and public.auth_worker_has_capability('VIEW_PRODUCTS')
    )
  );

drop policy if exists authoritative_tenant_select on public.customers;
create policy authoritative_tenant_select on public.customers
  for select to authenticated using (
    public.auth_account_type() in ('ADMIN', 'BUSINESS_OWNER')
    and public.auth_can_access_business(business_id)
    or (
      business_id = public.auth_business_id()
      and public.auth_worker_has_capability('VIEW_CUSTOMERS')
    )
  );

drop policy if exists authoritative_tenant_select on public.suppliers;
create policy authoritative_tenant_select on public.suppliers
  for select to authenticated using (
    public.auth_account_type() in ('ADMIN', 'BUSINESS_OWNER')
    and public.auth_can_access_business(business_id)
    or (
      business_id = public.auth_business_id()
      and public.auth_worker_has_capability('RECEIVE_STOCK')
    )
  );

drop policy if exists authoritative_tenant_select on public.sales;
create policy authoritative_tenant_select on public.sales
  for select to authenticated using (
    public.auth_account_type() in ('ADMIN', 'BUSINESS_OWNER')
    and public.auth_can_access_business(business_id)
    or (
      public.auth_account_type() = 'WORKER'
      and business_id = public.auth_business_id()
      and created_by_user_id = auth.uid()
      and branch_id in (select public.auth_branch_ids())
      and public.auth_worker_has_capability('VIEW_OWN_SALES')
      and public.auth_worker_has_capability('VIEW_RECEIPTS')
    )
  );

drop policy if exists authoritative_tenant_select on public.stock_movements;
create policy authoritative_tenant_select on public.stock_movements
  for select to authenticated using (
    public.auth_account_type() in ('ADMIN', 'BUSINESS_OWNER')
    and public.auth_can_access_business(business_id)
    or (
      public.auth_account_type() = 'WORKER'
      and business_id = public.auth_business_id()
      and branch_id in (select public.auth_branch_ids())
      and public.auth_worker_has_capability('VIEW_STOCK_MOVEMENTS')
    )
  );

drop policy if exists authoritative_tenant_select on public.stock_adjustments;
create policy authoritative_tenant_select on public.stock_adjustments
  for select to authenticated using (
    public.auth_account_type() in ('ADMIN', 'BUSINESS_OWNER')
    and public.auth_can_access_business(business_id)
    or (
      public.auth_account_type() = 'WORKER'
      and business_id = public.auth_business_id()
      and branch_id in (select public.auth_branch_ids())
      and public.auth_worker_has_capability('VIEW_STOCK_MOVEMENTS')
    )
  );

drop policy if exists authoritative_tenant_select on public.customer_credit_movements;
create policy authoritative_tenant_select on public.customer_credit_movements
  for select to authenticated using (
    public.auth_account_type() in ('ADMIN', 'BUSINESS_OWNER')
    and public.auth_can_access_business(business_id)
    or (
      business_id = public.auth_business_id()
      and public.auth_worker_has_capability('VIEW_CUSTOMERS')
    )
  );

drop policy if exists authoritative_tenant_select on public.purchases;
create policy authoritative_tenant_select on public.purchases
  for select to authenticated using (
    public.auth_account_type() in ('ADMIN', 'BUSINESS_OWNER')
    and public.auth_can_access_business(business_id)
    or (
      public.auth_account_type() = 'WORKER'
      and business_id = public.auth_business_id()
      and branch_id in (select public.auth_branch_ids())
      and public.auth_worker_has_capability('RECEIVE_STOCK')
    )
  );

drop policy if exists authoritative_tenant_select on public.expenses;
create policy authoritative_tenant_select on public.expenses
  for select to authenticated using (
    public.auth_account_type() in ('ADMIN', 'BUSINESS_OWNER')
    and public.auth_can_access_business(business_id)
    or (
      public.auth_account_type() = 'WORKER'
      and business_id = public.auth_business_id()
      and branch_id in (select public.auth_branch_ids())
      and public.auth_worker_has_capability('MANAGE_EXPENSES')
    )
  );

comment on function public.auth_worker_has_capability(text) is
  'Authoritative worker capability check with documented implied read capabilities.';
