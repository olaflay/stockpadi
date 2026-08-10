-- StockPadi initial schema.
-- Single-tenant: exactly one business_profile row, up to six branches.
-- No `business_id` scoping column anywhere: see .agents/rules/database-and-rls.md.
-- Stock and customer credit are NEVER stored as mutable totals: see
-- .agents/rules/offline-sync-and-ledger.md. inventory_stock and customer
-- credit balance are views computed from append-only ledgers below.

create extension if not exists "pgcrypto";

create type app_role as enum ('owner', 'manager', 'cashier', 'inventory_staff', 'accountant', 'admin');
create type stock_movement_source as enum ('sale', 'sale_void', 'purchase_receipt', 'adjustment', 'initial_stock');
create type payment_method as enum ('cash', 'transfer', 'pos_terminal', 'credit');
create type expiry_tracking_mode as enum ('off', 'optional', 'mandatory');

-- ---------------------------------------------------------------------------
-- Business profile and branches
-- ---------------------------------------------------------------------------

create table business_profile (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_type text not null,
  currency text not null default 'NGN',
  branding jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table business_profile is 'Single settings row. Never a multi-row businesses table, see .agents/rules/database-and-rls.md.';

create table branches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business_profile(id) on delete cascade,
  name text not null,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table branches is 'Up to six rows. Independent stock and staff per branch.';

-- ---------------------------------------------------------------------------
-- Users, roles, branch scoping
-- ---------------------------------------------------------------------------

create table users (
  id uuid primary key references auth.users (id) on delete cascade,
  business_id uuid not null references business_profile(id) on delete cascade,
  full_name text not null,
  role app_role not null,
  pin_hash text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_branches (
  user_id uuid not null references users (id) on delete cascade,
  branch_id uuid not null references branches (id) on delete cascade,
  business_id uuid not null references business_profile(id) on delete cascade,
  primary key (user_id, branch_id)
);
comment on table user_branches is 'Scopes cashier/inventory_staff accounts to specific branches. Owner/manager/accountant/admin see all branches by default at the app layer.';

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

create table categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business_profile(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table brands (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business_profile(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business_profile(id) on delete cascade,
  sku text not null,
  barcode text,
  name text not null,
  category_id uuid references categories (id),
  brand_id uuid references brands (id),
  unit_label text not null default 'piece',
  alt_unit_label text,
  alt_unit_conversion_factor numeric(14, 3),
  alt_unit_sell_price numeric(14, 2),
  cost_price numeric(14, 2) not null default 0,
  sell_price numeric(14, 2) not null default 0,
  expiry_tracking expiry_tracking_mode not null default 'off',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, sku)
);
comment on column products.version is 'Last-write-wins per field uses this counter; a mismatch on sync surfaces a "changed while offline" notice. See .agents/rules/offline-sync-and-ledger.md.';
comment on column products.unit_label is 'The unit stock is counted in — "piece", "kg", "bag" — free text, not a fixed picklist, since these terms are shop-specific (finding 1.1-D in docs/RESEARCH-AND-PLAN.md).';
comment on column products.alt_unit_label is 'Optional second unit this product can be sold by, e.g. "carton" — stock stays one pool in unit_label terms, sales in the alt unit deduct quantity * alt_unit_conversion_factor.';

create index products_barcode_idx on products (barcode);
create index products_updated_at_idx on products (updated_at desc);

-- ---------------------------------------------------------------------------
-- Stock ledger (the single most important table in this schema)
-- ---------------------------------------------------------------------------

create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique,
  business_id uuid not null references business_profile(id) on delete cascade,
  branch_id uuid not null references branches (id),
  product_id uuid not null references products (id),
  quantity_delta integer not null,
  source stock_movement_source not null,
  source_reference_id uuid,
  reason_code text,
  created_at_local timestamptz not null,
  created_at timestamptz not null default now(),
  created_by_user_id uuid not null references users (id)
);
comment on table stock_movements is 'Append-only. Current stock is SUM(quantity_delta) per product/branch, never a stored mutable field. See .agents/rules/offline-sync-and-ledger.md. client_id is the idempotency key for sync replay.';

create index stock_movements_product_branch_idx on stock_movements (product_id, branch_id);

-- inventory_stock is a VIEW, not a table, so there is structurally no place
-- to write an UPDATE that bypasses the ledger.
create view inventory_stock with (security_invoker = true) as
select
  product_id,
  branch_id,
  sum(quantity_delta)::integer as quantity
from stock_movements
group by product_id, branch_id;

create table stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique,
  business_id uuid not null references business_profile(id) on delete cascade,
  branch_id uuid not null references branches (id),
  product_id uuid not null references products (id),
  quantity_delta integer not null,
  reason_code text not null,
  note text,
  stock_movement_id uuid references stock_movements (id),
  created_at timestamptz not null default now(),
  created_by_user_id uuid not null references users (id)
);
comment on table stock_adjustments is 'Manual corrections. Mandatory reason_code. Always paired 1:1 with a stock_movements row via stock_movement_id.';

-- ---------------------------------------------------------------------------
-- Customers and credit ledger
-- ---------------------------------------------------------------------------

create table customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business_profile(id) on delete cascade,
  name text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table customer_credit_movements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique,
  business_id uuid not null references business_profile(id) on delete cascade,
  customer_id uuid not null references customers (id),
  amount_delta numeric(14, 2) not null,
  source_reference_id uuid,
  note text,
  created_at_local timestamptz not null,
  created_at timestamptz not null default now(),
  created_by_user_id uuid not null references users (id)
);
comment on table customer_credit_movements is 'Append-only, same delta-merge reasoning as stock_movements. See .agents/rules/offline-sync-and-ledger.md.';

create view customer_credit_balances with (security_invoker = true) as
select
  customer_id,
  sum(amount_delta) as balance
from customer_credit_movements
group by customer_id;

-- ---------------------------------------------------------------------------
-- Sales (immutable once created)
-- ---------------------------------------------------------------------------

create table sales (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique,
  business_id uuid not null references business_profile(id) on delete cascade,
  branch_id uuid not null references branches (id),
  customer_id uuid references customers (id),
  subtotal numeric(14, 2) not null,
  discount numeric(14, 2) not null default 0,
  total numeric(14, 2) not null,
  created_at_local timestamptz not null,
  created_at timestamptz not null default now(),
  created_by_user_id uuid not null references users (id),
  voided_at timestamptz,
  voided_by_user_id uuid references users (id),
  void_reason text
);
comment on table sales is 'Immutable once created. No edit path. Only voided_at may be set later, and only online. See .agents/rules/offline-sync-and-ledger.md.';

create index sales_branch_created_idx on sales (branch_id, created_at desc);

-- A sale can be paid by more than one method (part cash, part transfer for
-- one purchase) — the single payment_method column this table originally
-- shipped with is replaced by this line-item table before any live
-- deployment exists to migrate (docs/SCAFFOLD.md: never applied against a
-- live instance), so this edits the pre-launch schema in place rather than
-- layering a second migration on schema nothing has run yet. See finding
-- 1.1-A in docs/RESEARCH-AND-PLAN.md — the most-endorsed complaint found
-- researching this product.
create table sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales (id) on delete cascade,
  method payment_method not null,
  amount numeric(14, 2) not null check (amount > 0)
);
comment on table sale_payments is 'One or more per sale; amounts must sum to sales.total. See .agents/rules/offline-sync-and-ledger.md.';

create index sale_payments_sale_idx on sale_payments (sale_id);

create table sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales (id) on delete cascade,
  product_id uuid not null references products (id),
  quantity integer not null,
  unit_price numeric(14, 2) not null,
  discount numeric(14, 2) not null default 0,
  unit_label text not null default 'piece',
  unit_conversion_factor numeric(14, 3) not null default 1
);
comment on column sale_items.unit_conversion_factor is 'How many of the product''s base unit (products.unit_label) one sold unit represents. Stock movements for this line deduct quantity * unit_conversion_factor, so stock always stays one pool regardless of which unit was sold. See finding 1.1-D.';

-- ---------------------------------------------------------------------------
-- Purchases and suppliers
-- ---------------------------------------------------------------------------

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business_profile(id) on delete cascade,
  name text not null,
  phone text,
  balance numeric(14, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table purchases (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique,
  business_id uuid not null references business_profile(id) on delete cascade,
  branch_id uuid not null references branches (id),
  supplier_id uuid not null references suppliers (id),
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  created_by_user_id uuid not null references users (id)
);

create table purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases (id) on delete cascade,
  product_id uuid not null references products (id),
  quantity integer not null,
  unit_cost numeric(14, 2) not null
);

-- ---------------------------------------------------------------------------
-- Expenses, receipts, audit, devices
-- ---------------------------------------------------------------------------

create table expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business_profile(id) on delete cascade,
  branch_id uuid references branches (id),
  category text not null,
  amount numeric(14, 2) not null,
  note text,
  created_at timestamptz not null default now(),
  created_by_user_id uuid not null references users (id)
);
comment on column expenses.branch_id is 'Nullable: an expense may be business-wide rather than tied to one branch.';

create table receipts (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales (id),
  format text not null default 'standard',
  created_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business_profile(id) on delete cascade,
  actor_user_id uuid not null references users (id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);
comment on table audit_logs is 'Every void, stock adjustment, role change, and PIN reset writes here. See .agents/rules/database-and-rls.md.';

create table devices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business_profile(id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  device_label text,
  last_seen_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
comment on table devices is 'Supports offline PIN auth and the 30-day no-contact token expiry. See PRD Section 10.3.';

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger business_profile_set_updated_at before update on business_profile
  for each row execute function set_updated_at();
create trigger branches_set_updated_at before update on branches
  for each row execute function set_updated_at();
create trigger users_set_updated_at before update on users
  for each row execute function set_updated_at();
create trigger customers_set_updated_at before update on customers
  for each row execute function set_updated_at();

create function bump_product_version() returns trigger as $$
begin
  new.version = old.version + 1;
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger products_bump_version before update on products
  for each row execute function bump_product_version();

-- Handle new user registration automatically
create or replace function public.handle_new_owner()
returns trigger as $$
declare
  v_business_id uuid;
begin
  if (new.raw_user_meta_data->>'role') = 'owner' then
    insert into public.business_profile (name, business_type, currency)
    values (
      coalesce(new.raw_user_meta_data->>'business_name', 'My Store'),
      coalesce(new.raw_user_meta_data->>'business_type_id', 'general_retail'),
      'NGN'
    ) returning id into v_business_id;

    insert into public.users (id, business_id, full_name, role, is_active)
    values (new.id, v_business_id, coalesce(new.raw_user_meta_data->>'full_name', ''), 'owner', true);

    insert into public.branches (business_id, name, is_active)
    values (v_business_id, 'Main branch', true);
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_owner();
