-- Role-based RLS within a multi-tenant database. Every row already belongs
-- to a specific tenant (business_id); these policies enforce both tenant
-- isolation and who on the team can see or touch what, per the matrix in
-- .agents/rules/database-and-rls.md. A UI element being hidden is not a
-- security control, this is.
--
-- ASSUMPTION FLAGGED FOR CONFIRMATION: the PRD marks Manager's "Manage
-- expenses" and "View audit log" as "Limited" without defining the limit.
-- This migration interprets "Limited" as: Manager may insert/select but not
-- delete expenses, and may select audit_logs but not see role-change or
-- PIN-reset entries. Confirm this reading before Phase 1 goes live; it is a
-- guess made explicit, not a silent decision. See AGENTS.md "If something
-- isn't covered here".

create function auth_role() returns app_role as $$
  select role from users where id = auth.uid();
$$ language sql stable security definer set search_path = public;

create function auth_business_id() returns uuid as $$
  select business_id from users where id = auth.uid();
$$ language sql stable security definer set search_path = public;

create function auth_branch_ids() returns setof uuid as $$
  select branch_id from user_branches where user_id = auth.uid();
$$ language sql stable security definer set search_path = public;

create function auth_is_branch_scoped_role() returns boolean as $$
  select auth_role() in ('cashier', 'inventory_staff');
$$ language sql stable;

alter table business_profile enable row level security;
alter table branches enable row level security;
alter table users enable row level security;
alter table user_branches enable row level security;
alter table categories enable row level security;
alter table brands enable row level security;
alter table products enable row level security;
alter table stock_movements enable row level security;
alter table stock_adjustments enable row level security;
alter table customers enable row level security;
alter table customer_credit_movements enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;
alter table sale_payments enable row level security;
alter table suppliers enable row level security;
alter table purchases enable row level security;
alter table purchase_items enable row level security;
alter table expenses enable row level security;
alter table receipts enable row level security;
alter table audit_logs enable row level security;
alter table devices enable row level security;

-- ---------------------------------------------------------------------------
-- business_profile / branches: read by anyone signed in, write by owner/admin
-- ---------------------------------------------------------------------------

create policy business_profile_select on business_profile for select
  to authenticated using (id = auth_business_id());
create policy business_profile_write on business_profile for all
  to authenticated using (id = auth_business_id() and auth_role() in ('owner', 'admin'))
  with check (id = auth_business_id() and auth_role() in ('owner', 'admin'));

create policy branches_select on branches for select
  to authenticated using (business_id = auth_business_id());
create policy branches_write on branches for all
  to authenticated using (business_id = auth_business_id() and auth_role() in ('owner', 'admin'))
  with check (business_id = auth_business_id() and auth_role() in ('owner', 'admin'));

-- ---------------------------------------------------------------------------
-- users / user_branches: staff management is owner/admin only
-- ---------------------------------------------------------------------------

create policy users_select on users for select
  to authenticated using (
    business_id = auth_business_id() and
    (id = auth.uid() or auth_role() in ('owner', 'manager', 'accountant', 'admin'))
  );
create policy users_write on users for all
  to authenticated using (business_id = auth_business_id() and auth_role() in ('owner', 'admin'))
  with check (business_id = auth_business_id() and auth_role() in ('owner', 'admin'));

create policy user_branches_select on user_branches for select
  to authenticated using (
    business_id = auth_business_id() and
    (user_id = auth.uid() or auth_role() in ('owner', 'manager', 'accountant', 'admin'))
  );
create policy user_branches_write on user_branches for all
  to authenticated using (business_id = auth_business_id() and auth_role() in ('owner', 'admin'))
  with check (business_id = auth_business_id() and auth_role() in ('owner', 'admin'));

-- ---------------------------------------------------------------------------
-- Catalog: everyone signed in can read (needed for POS lookup), edits
-- restricted to owner/manager/inventory_staff/admin per the matrix's
-- "Add/edit products" and "Stock adjustments" rows
-- ---------------------------------------------------------------------------

create policy categories_select on categories for select to authenticated using (business_id = auth_business_id());
create policy categories_write on categories for all
  to authenticated using (business_id = auth_business_id() and auth_role() in ('owner', 'manager', 'inventory_staff', 'admin'))
  with check (business_id = auth_business_id() and auth_role() in ('owner', 'manager', 'inventory_staff', 'admin'));

create policy brands_select on brands for select to authenticated using (business_id = auth_business_id());
create policy brands_write on brands for all
  to authenticated using (business_id = auth_business_id() and auth_role() in ('owner', 'manager', 'inventory_staff', 'admin'))
  with check (business_id = auth_business_id() and auth_role() in ('owner', 'manager', 'inventory_staff', 'admin'));

create policy products_select on products for select to authenticated using (business_id = auth_business_id());
create policy products_write on products for all
  to authenticated using (business_id = auth_business_id() and auth_role() in ('owner', 'manager', 'inventory_staff', 'admin'))
  with check (business_id = auth_business_id() and auth_role() in ('owner', 'manager', 'inventory_staff', 'admin'));

-- ---------------------------------------------------------------------------
-- Stock ledger: branch-scoped roles see only their branch(es), unrestricted
-- roles see all branches. Insert permission mirrors "Stock adjustments" row.
-- ---------------------------------------------------------------------------

create policy stock_movements_select on stock_movements for select
  to authenticated using (
    business_id = auth_business_id() and
    (not auth_is_branch_scoped_role() or branch_id in (select auth_branch_ids()))
  );
create policy stock_movements_insert on stock_movements for insert
  to authenticated with check (
    business_id = auth_business_id() and
    auth_role() in ('owner', 'manager', 'cashier', 'inventory_staff', 'admin')
    and (not auth_is_branch_scoped_role() or branch_id in (select auth_branch_ids()))
  );
comment on policy stock_movements_insert on stock_movements is 'Cashier writes are sale-driven only, enforced at the application/Edge Function layer per .agents/skills/write-edge-function.md, not distinguishable by source at the RLS layer alone.';

create policy stock_adjustments_select on stock_adjustments for select
  to authenticated using (
    business_id = auth_business_id() and
    (not auth_is_branch_scoped_role() or branch_id in (select auth_branch_ids()))
  );
create policy stock_adjustments_insert on stock_adjustments for insert
  to authenticated with check (
    business_id = auth_business_id() and
    auth_role() in ('owner', 'manager', 'inventory_staff', 'admin')
    and (not auth_is_branch_scoped_role() or branch_id in (select auth_branch_ids()))
  );

-- ---------------------------------------------------------------------------
-- Customers and credit ledger: readable by anyone signed in (needed at
-- checkout), credit movements written by whoever can process a sale
-- ---------------------------------------------------------------------------

create policy customers_select on customers for select to authenticated using (business_id = auth_business_id());
create policy customers_write on customers for insert to authenticated with check (business_id = auth_business_id());
create policy customers_update on customers for update
  to authenticated using (business_id = auth_business_id() and auth_role() in ('owner', 'manager', 'admin'))
  with check (business_id = auth_business_id() and auth_role() in ('owner', 'manager', 'admin'));

create policy customer_credit_movements_select on customer_credit_movements
  for select to authenticated using (business_id = auth_business_id());
create policy customer_credit_movements_insert on customer_credit_movements
  for insert to authenticated with check (
    business_id = auth_business_id() and
    auth_role() in ('owner', 'manager', 'cashier', 'accountant', 'admin')
  );

-- ---------------------------------------------------------------------------
-- Sales: cashiers see only their own sales, inventory_staff sees none,
-- everyone else sees all. Void is a column update, gated to the roles the
-- matrix allows; the online-only requirement is enforced client-side and in
-- the sync Edge Function, RLS has no notion of connectivity.
-- ---------------------------------------------------------------------------

create policy sales_select on sales for select
  to authenticated using (
    business_id = auth_business_id() and
    case auth_role()
      when 'cashier' then created_by_user_id = auth.uid()
      when 'inventory_staff' then false
      else true
    end
  );
create policy sales_insert on sales for insert
  to authenticated with check (
    business_id = auth_business_id() and
    auth_role() in ('owner', 'manager', 'cashier', 'admin')
  );
create policy sales_void on sales for update
  to authenticated using (business_id = auth_business_id() and auth_role() in ('owner', 'manager', 'admin'))
  with check (business_id = auth_business_id() and auth_role() in ('owner', 'manager', 'admin'));

create policy sale_items_select on sale_items for select
  to authenticated using (
    exists (
      select 1 from sales
      where sales.id = sale_items.sale_id
    )
  );
comment on policy sale_items_select on sale_items is 'Delegates to sales_select via the join; a role that cannot see the parent sale cannot see its items either.';
create policy sale_items_insert on sale_items for insert
  to authenticated with check (
    exists (
      select 1 from sales
      where sales.id = sale_items.sale_id
      and sales.created_by_user_id = auth.uid()
    )
  );

create policy sale_payments_select on sale_payments for select
  to authenticated using (
    exists (
      select 1 from sales
      where sales.id = sale_payments.sale_id
    )
  );
comment on policy sale_payments_select on sale_payments is 'Same delegation pattern as sale_items_select.';
create policy sale_payments_insert on sale_payments for insert
  to authenticated with check (
    exists (
      select 1 from sales
      where sales.id = sale_payments.sale_id
      and sales.created_by_user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Purchases and suppliers: same role set as product/stock edits, accountant
-- gets read access for supplier balance visibility
-- ---------------------------------------------------------------------------

create policy suppliers_select on suppliers for select
  to authenticated using (
    business_id = auth_business_id() and
    auth_role() in ('owner', 'manager', 'inventory_staff', 'accountant', 'admin')
  );
create policy suppliers_write on suppliers for all
  to authenticated using (business_id = auth_business_id() and auth_role() in ('owner', 'manager', 'inventory_staff', 'admin'))
  with check (business_id = auth_business_id() and auth_role() in ('owner', 'manager', 'inventory_staff', 'admin'));

create policy purchases_select on purchases for select
  to authenticated using (
    business_id = auth_business_id() and
    (not auth_is_branch_scoped_role() or branch_id in (select auth_branch_ids()))
  );
create policy purchases_write on purchases for all
  to authenticated using (
    business_id = auth_business_id() and
    auth_role() in ('owner', 'manager', 'inventory_staff', 'admin')
    and (not auth_is_branch_scoped_role() or branch_id in (select auth_branch_ids()))
  )
  with check (
    business_id = auth_business_id() and
    auth_role() in ('owner', 'manager', 'inventory_staff', 'admin')
    and (not auth_is_branch_scoped_role() or branch_id in (select auth_branch_ids()))
  );

create policy purchase_items_select on purchase_items for select
  to authenticated using (
    exists (select 1 from purchases where purchases.id = purchase_items.purchase_id)
  );
create policy purchase_items_write on purchase_items for all
  to authenticated using (
    auth_role() in ('owner', 'manager', 'inventory_staff', 'admin')
  )
  with check (
    auth_role() in ('owner', 'manager', 'inventory_staff', 'admin')
  );

-- ---------------------------------------------------------------------------
-- Expenses: owner/accountant/admin unrestricted, manager "limited" to
-- insert+select (no delete), everyone else no access. See flagged assumption
-- at the top of this file.
-- ---------------------------------------------------------------------------

create policy expenses_select on expenses for select
  to authenticated using (business_id = auth_business_id() and auth_role() in ('owner', 'manager', 'accountant', 'admin'));
create policy expenses_insert on expenses for insert
  to authenticated with check (business_id = auth_business_id() and auth_role() in ('owner', 'manager', 'accountant', 'admin'));
create policy expenses_update on expenses for update
  to authenticated using (business_id = auth_business_id() and auth_role() in ('owner', 'accountant', 'admin'))
  with check (business_id = auth_business_id() and auth_role() in ('owner', 'accountant', 'admin'));
create policy expenses_delete on expenses for delete
  to authenticated using (business_id = auth_business_id() and auth_role() in ('owner', 'accountant', 'admin'));

-- ---------------------------------------------------------------------------
-- Receipts: visible to anyone who can see the parent sale
-- ---------------------------------------------------------------------------

create policy receipts_select on receipts for select
  to authenticated using (
    exists (select 1 from sales where sales.id = receipts.sale_id)
  );
create policy receipts_insert on receipts for insert
  to authenticated with check (
    exists (select 1 from sales where sales.id = receipts.sale_id)
  );

-- ---------------------------------------------------------------------------
-- Audit log: owner/admin unrestricted, manager limited to non-role,
-- non-PIN-reset actions (see flagged assumption at top of file), no one else
-- ---------------------------------------------------------------------------

create policy audit_logs_select on audit_logs for select
  to authenticated using (
    business_id = auth_business_id() and
    (auth_role() in ('owner', 'admin')
    or (auth_role() = 'manager' and action not in ('role_change', 'pin_reset')))
  );
create policy audit_logs_insert on audit_logs for insert
  to authenticated with check (business_id = auth_business_id());
comment on policy audit_logs_insert on audit_logs is 'Every actor can write their own audit trail entry; the application layer is responsible for calling this on every void/adjustment/role-change/PIN-reset, never optional.';

-- ---------------------------------------------------------------------------
-- Devices: a user manages their own device rows, owner/admin can see all
-- (for lost/stolen device revocation)
-- ---------------------------------------------------------------------------

create policy devices_select on devices for select
  to authenticated using (
    business_id = auth_business_id() and
    (user_id = auth.uid() or auth_role() in ('owner', 'admin'))
  );
create policy devices_write on devices for all
  to authenticated using (
    business_id = auth_business_id() and
    (user_id = auth.uid() or auth_role() in ('owner', 'admin'))
  )
  with check (
    business_id = auth_business_id() and
    (user_id = auth.uid() or auth_role() in ('owner', 'admin'))
  );
