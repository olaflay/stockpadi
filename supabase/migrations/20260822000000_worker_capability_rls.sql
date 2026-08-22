-- Worker capability and branch-scope hardening. This is forward-only; legacy
-- role columns remain compatibility data until every historical dependency is
-- removed.

create or replace function public.auth_worker_has_capability(p_permission text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.auth_account_type() = 'BUSINESS_OWNER'
    or (public.auth_account_type() = 'WORKER' and exists (
      select 1
      from public.worker_permissions wp
      where wp.user_id = auth.uid()
        and wp.business_id = public.auth_business_id()
        and wp.permission = p_permission
        and wp.enabled = true
    ));
$$;

grant execute on function public.auth_worker_has_capability(text) to authenticated, service_role;

insert into public.worker_permissions (user_id, business_id, permission, enabled)
select m.user_id, m.business_id, permissions.permission, true
from public.business_memberships m
cross join (values
  ('POS_SELL'), ('VIEW_PRODUCTS'), ('VIEW_BRANCH_STOCK'), ('VIEW_STOCK_MOVEMENTS'),
  ('SUBMIT_STOCK_COUNT'), ('SUBMIT_RECONCILIATION'), ('VIEW_CUSTOMERS'),
  ('USE_CUSTOMER_CREDIT'), ('VIEW_OWN_SALES'), ('VIEW_RECEIPTS'), ('VIEW_ALERTS')
) as permissions(permission)
where m.account_type = 'WORKER'
on conflict (user_id, business_id, permission) do nothing;

drop policy if exists worker_permissions_select on public.worker_permissions;
create policy worker_permissions_select on public.worker_permissions
  for select to authenticated
  using (
    user_id = auth.uid()
    or (business_id = public.auth_business_id() and public.auth_account_type() = 'BUSINESS_OWNER')
    or public.auth_account_type() = 'ADMIN'
  );

drop policy if exists authoritative_tenant_select on public.reconciliation_records;
create policy authoritative_tenant_select on public.reconciliation_records
  for select to authenticated
  using (
    public.auth_account_type() = 'ADMIN'
    or (
      business_id = public.auth_business_id()
      and (
        public.auth_account_type() = 'BUSINESS_OWNER'
        or actor_user_id = auth.uid()
        or (
          public.auth_worker_has_capability('VIEW_BRANCH_RECONCILIATION')
          and branch_id in (select public.auth_branch_ids())
        )
      )
    )
  );

comment on function public.auth_worker_has_capability(text) is
  'Authoritative Worker capability check. Business Owners are business-scoped, never platform admins.';
