-- inventory_stock was a plain VIEW doing SUM(quantity_delta) GROUP BY over
-- the entire stock_movements ledger on every read. That's fine at a handful
-- of products, but at real scale (2,000+ products, 200 sales/day — each
-- sale writing one movement row per line item — means the ledger grows by
-- hundreds of rows daily, forever, since it's append-only and never
-- pruned) it becomes a full-table aggregation on every dashboard render,
-- every POS product lookup, every report. That's the single query almost
-- every screen in this app depends on.
--
-- .agents/rules/offline-sync-and-ledger.md explicitly sanctions this:
-- "If inventory_stock is implemented as a materialized view or a
-- trigger-maintained aggregate, that implementation detail can change, the
-- rule that nothing bypasses the ledger cannot." stock_movements is
-- insert-only (20260808120000 revoked direct INSERT from authenticated
-- entirely; nothing anywhere grants UPDATE or DELETE on it — it never
-- changes or gets removed, only appended to via the sync_apply_* /
-- stock_movements_insert functions), so a simple additive AFTER INSERT
-- trigger keeps this exactly correct with O(1) writes and O(1) reads,
-- instead of an O(n) scan that gets slower every single day.

create table inventory_stock_rollup (
  product_id uuid not null references products (id),
  branch_id uuid not null references branches (id),
  quantity integer not null default 0,
  primary key (product_id, branch_id)
);
comment on table inventory_stock_rollup is 'Trigger-maintained running total of stock_movements.quantity_delta, kept in sync by stock_movements_bump_rollup. Never written to directly — see .agents/rules/offline-sync-and-ledger.md. The inventory_stock view reads from this table.';

-- Backfill from every stock_movements row that already exists.
insert into inventory_stock_rollup (product_id, branch_id, quantity)
select product_id, branch_id, sum(quantity_delta)::integer
from stock_movements
group by product_id, branch_id;

create function stock_movements_bump_rollup()
returns trigger
language plpgsql
as $$
begin
  insert into inventory_stock_rollup (product_id, branch_id, quantity)
  values (new.product_id, new.branch_id, new.quantity_delta)
  on conflict (product_id, branch_id)
    do update set quantity = inventory_stock_rollup.quantity + excluded.quantity;
  return new;
end;
$$;

create trigger stock_movements_bump_rollup_trigger
  after insert on stock_movements
  for each row execute function stock_movements_bump_rollup();

-- Same shape and name as before, so every existing query, RLS policy, and
-- client read against inventory_stock keeps working unchanged — only the
-- backing implementation moved from an O(n) scan to an O(1) indexed lookup.
drop view if exists inventory_stock;
create view inventory_stock with (security_invoker = true) as
select product_id, branch_id, quantity
from inventory_stock_rollup;

alter table inventory_stock_rollup enable row level security;
create policy inventory_stock_rollup_select on inventory_stock_rollup for select
  to authenticated using (
    exists (
      select 1 from products
      where products.id = inventory_stock_rollup.product_id
        and products.business_id = auth_business_id()
    )
  );

-- Only the trigger (running in the SECURITY DEFINER context of the
-- sync_apply_* functions that are the only path to stock_movements) ever
-- writes here. Supabase's project-level default privileges grant
-- authenticated broad INSERT/UPDATE/DELETE on every new table by default
-- (the exact gap 20260808120000 closed for the other ledger tables) — revoke
-- it explicitly rather than relying on RLS having no permissive policy as
-- the only backstop.
revoke insert, update, delete on inventory_stock_rollup from authenticated, anon;
