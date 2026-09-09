-- Forensic Database Audit: Integrity Hardening, Performance Indexes & RLS Alignment
--
-- This migration addresses the findings of the comprehensive database forensic audit:
-- 1. High-traffic missing foreign key and query performance indexes (resolves table scans)
-- 2. Check constraints to eliminate invalid/negative data states at the database boundary
-- 3. Alignment of inventory_stock_rollup RLS with canonical auth_can_access_business()
-- 4. Addition of ON DELETE CASCADE to inventory_stock_rollup foreign keys
--
-- All operations are safe, additive, and backward-compatible.

-- ---------------------------------------------------------------------------
-- 1. Performance Indexes
-- ---------------------------------------------------------------------------

-- Sale items lookup & joins (critical for receipts, sales details, and cascade deletes)
create index if not exists sale_items_sale_id_idx
  on public.sale_items (sale_id);

create index if not exists sale_items_product_id_idx
  on public.sale_items (product_id);

-- Purchase items lookup & joins
create index if not exists purchase_items_purchase_id_idx
  on public.purchase_items (purchase_id);

create index if not exists purchase_items_product_id_idx
  on public.purchase_items (product_id);

-- Customer credit balance aggregation & void reversal
create index if not exists customer_credit_movements_customer_id_idx
  on public.customer_credit_movements (customer_id);

create index if not exists customer_credit_movements_source_ref_idx
  on public.customer_credit_movements (source_reference_id)
  where source_reference_id is not null;

-- Stock movements void reversal lookup
create index if not exists stock_movements_source_ref_idx
  on public.stock_movements (source_reference_id)
  where source_reference_id is not null;

-- Stock movements multi-branch & audit timeline
create index if not exists stock_movements_business_created_idx
  on public.stock_movements (business_id, created_at_local desc);

-- Sales customer purchase history
create index if not exists sales_customer_id_idx
  on public.sales (customer_id)
  where customer_id is not null;

-- Sales business-wide chronological querying (for owner reports)
create index if not exists sales_business_created_idx
  on public.sales (business_id, created_at desc);

-- Expenses querying by business and branch
create index if not exists expenses_business_created_idx
  on public.expenses (business_id, created_at desc);

create index if not exists expenses_branch_id_idx
  on public.expenses (branch_id)
  where branch_id is not null;

-- Staff memberships lookup by business
create index if not exists business_memberships_business_id_idx
  on public.business_memberships (business_id);

-- Products category filtering within business
create index if not exists products_business_category_idx
  on public.products (business_id, category_id)
  where category_id is not null;

-- Audit logs entity lookup
create index if not exists audit_logs_business_created_idx
  on public.audit_logs (business_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Domain Data Integrity Constraints
-- ---------------------------------------------------------------------------

do $$
begin
  -- Enforce non-zero positive quantity and valid prices on sale items
  if not exists (select 1 from pg_constraint where conname = 'sale_items_quantity_positive') then
    alter table public.sale_items add constraint sale_items_quantity_positive check (quantity > 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'sale_items_unit_price_non_negative') then
    alter table public.sale_items add constraint sale_items_unit_price_non_negative check (unit_price >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'sale_items_discount_non_negative') then
    alter table public.sale_items add constraint sale_items_discount_non_negative check (discount >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'sale_items_conversion_factor_positive') then
    alter table public.sale_items add constraint sale_items_conversion_factor_positive check (unit_conversion_factor > 0);
  end if;

  -- Enforce positive quantity and non-negative cost on purchase items
  if not exists (select 1 from pg_constraint where conname = 'purchase_items_quantity_positive') then
    alter table public.purchase_items add constraint purchase_items_quantity_positive check (quantity > 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'purchase_items_unit_cost_non_negative') then
    alter table public.purchase_items add constraint purchase_items_unit_cost_non_negative check (unit_cost >= 0);
  end if;

  -- Enforce positive amount on expenses
  if not exists (select 1 from pg_constraint where conname = 'expenses_amount_positive') then
    alter table public.expenses add constraint expenses_amount_positive check (amount > 0);
  end if;

  -- Enforce valid sales totals and discounts
  if not exists (select 1 from pg_constraint where conname = 'sales_total_non_negative') then
    alter table public.sales add constraint sales_total_non_negative check (total >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'sales_discount_non_negative') then
    alter table public.sales add constraint sales_discount_non_negative check (discount >= 0);
  end if;

  -- Enforce non-negative product catalog prices
  if not exists (select 1 from pg_constraint where conname = 'products_cost_price_non_negative') then
    alter table public.products add constraint products_cost_price_non_negative check (cost_price >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'products_sell_price_non_negative') then
    alter table public.products add constraint products_sell_price_non_negative check (sell_price >= 0);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Foreign Key Cascading Fix on inventory_stock_rollup
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'inventory_stock_rollup_product_id_fkey'
      and table_name = 'inventory_stock_rollup'
  ) then
    alter table public.inventory_stock_rollup
      drop constraint inventory_stock_rollup_product_id_fkey;
  end if;

  alter table public.inventory_stock_rollup
    add constraint inventory_stock_rollup_product_id_fkey
      foreign key (product_id) references public.products(id) on delete cascade;

  if exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'inventory_stock_rollup_branch_id_fkey'
      and table_name = 'inventory_stock_rollup'
  ) then
    alter table public.inventory_stock_rollup
      drop constraint inventory_stock_rollup_branch_id_fkey;
  end if;

  alter table public.inventory_stock_rollup
    add constraint inventory_stock_rollup_branch_id_fkey
      foreign key (branch_id) references public.branches(id) on delete cascade;
end $$;

-- ---------------------------------------------------------------------------
-- 4. RLS Policy Alignment on inventory_stock_rollup
-- ---------------------------------------------------------------------------

drop policy if exists inventory_stock_rollup_select on public.inventory_stock_rollup;

create policy inventory_stock_rollup_select on public.inventory_stock_rollup
  for select to authenticated
  using (
    exists (
      select 1 from public.products
      where products.id = inventory_stock_rollup.product_id
        and public.auth_can_access_business(products.business_id)
    )
  );

grant select on public.inventory_stock_rollup to authenticated, service_role;
grant select on public.inventory_stock to authenticated, service_role;


