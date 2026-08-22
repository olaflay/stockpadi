-- Tighten direct authenticated reads after the broad tenant cutover. Backend
-- checks remain mandatory for service-role paths, but RLS must also prevent a
-- Worker from reading Owner-wide operational data directly.

drop policy if exists authoritative_tenant_select on public.sales;
create policy authoritative_tenant_select on public.sales
  for select to authenticated using (
    public.auth_account_type() in ('ADMIN', 'BUSINESS_OWNER') and public.auth_can_access_business(business_id)
    or (public.auth_account_type() = 'WORKER' and business_id = public.auth_business_id() and created_by_user_id = auth.uid() and branch_id in (select public.auth_branch_ids()))
  );

drop policy if exists authoritative_tenant_select on public.stock_movements;
create policy authoritative_tenant_select on public.stock_movements
  for select to authenticated using (
    public.auth_account_type() in ('ADMIN', 'BUSINESS_OWNER') and public.auth_can_access_business(business_id)
    or (public.auth_account_type() = 'WORKER' and business_id = public.auth_business_id() and branch_id in (select public.auth_branch_ids()))
  );

drop policy if exists authoritative_tenant_select on public.purchases;
create policy authoritative_tenant_select on public.purchases
  for select to authenticated using (
    public.auth_account_type() in ('ADMIN', 'BUSINESS_OWNER') and public.auth_can_access_business(business_id)
  );

drop policy if exists authoritative_tenant_select on public.expenses;
create policy authoritative_tenant_select on public.expenses
  for select to authenticated using (
    public.auth_account_type() in ('ADMIN', 'BUSINESS_OWNER') and public.auth_can_access_business(business_id)
  );

drop policy if exists authoritative_tenant_select on public.sale_items;
create policy authoritative_tenant_select on public.sale_items
  for select to authenticated using (exists (select 1 from public.sales s where s.id = sale_id));

drop policy if exists authoritative_tenant_select on public.sale_payments;
create policy authoritative_tenant_select on public.sale_payments
  for select to authenticated using (exists (select 1 from public.sales s where s.id = sale_id));
