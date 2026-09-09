import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const migrationsDir = fileURLToPath(new URL("../migrations/", import.meta.url));

function allMigrationFilenames(): string[] {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

let db: PGlite;
let bizA: string;
let bizB: string;
let ownerA: string;
let adminId: string;
let prodA: string;
let branchA: string;

async function actAs(userId: string) {
  await db.exec("set role authenticated;");
  await db.exec(
    `set request.jwt.claims = '${JSON.stringify({ sub: userId, role: "authenticated" })}';`
  );
}

async function resetToSuperuser() {
  await db.exec("reset role;");
  await db.exec("reset request.jwt.claims;");
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });

  await db.exec("create schema if not exists auth;");
  await db.exec(
    "create table auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb default '{}'::jsonb);"
  );
  await db.exec(`
    create or replace function auth.uid() returns uuid as $$
      select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid
    $$ language sql stable;
  `);
  await db.exec(`
    do $$ begin
      if not exists (select from pg_roles where rolname = 'anon') then create role anon; end if;
      if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
      if not exists (select from pg_roles where rolname = 'service_role') then create role service_role bypassrls; end if;
    end $$;
  `);

  // Apply all migrations in sequence
  for (const filename of allMigrationFilenames()) {
    const sql = readFileSync(`${migrationsDir}${filename}`, "utf8");
    await db.exec(sql);
  }

  await db.exec("grant usage on schema public to anon, authenticated, service_role;");
  await db.exec("grant select, insert, update, delete on all tables in schema public to authenticated;");
  await db.exec("grant all on all tables in schema public to service_role;");

  // Setup seed data for audit verification
  const resAdmin = await db.query<{ id: string }>(
    `insert into auth.users (id) values (gen_random_uuid()) returning id`
  );
  adminId = resAdmin.rows[0].id;
  await db.exec(
    `insert into platform_admins (user_id, status) values ('${adminId}', 'active');`
  );

  const resBizA = await db.query<{ id: string }>(
    `insert into business_profile (name, business_type, is_active, status) values ('Shop A', 'retail', true, 'verified') returning id;`
  );
  bizA = resBizA.rows[0].id;

  const resBizB = await db.query<{ id: string }>(
    `insert into business_profile (name, business_type, is_active, status) values ('Shop B', 'retail', true, 'verified') returning id;`
  );
  bizB = resBizB.rows[0].id;

  const resOwnerA = await db.query<{ id: string }>(
    `insert into auth.users (id) values (gen_random_uuid()) returning id;`
  );
  ownerA = resOwnerA.rows[0].id;

  await db.exec(`
    insert into users (id, business_id, full_name, role, is_active)
    values ('${ownerA}', '${bizA}', 'Owner A', 'owner', true);
  `);

  await db.exec(`
    insert into business_memberships (user_id, business_id, role, account_type, status)
    values ('${ownerA}', '${bizA}', 'owner', 'BUSINESS_OWNER', 'active');
  `);

  const resBranchA = await db.query<{ id: string }>(
    `insert into branches (business_id, name) values ('${bizA}', 'Branch A') returning id;`
  );
  branchA = resBranchA.rows[0].id;

  const resProdA = await db.query<{ id: string }>(
    `insert into products (business_id, sku, name, sell_price, cost_price)
     values ('${bizA}', 'SKU-A1', 'Item A1', 100, 50) returning id;`
  );
  prodA = resProdA.rows[0].id;
});

afterEach(async () => {
  await resetToSuperuser();
});

describe("Database Forensic Audit Verification", () => {
  it("verifies all forensic performance indexes exist in pg_indexes", async () => {
    const requiredIndexes = [
      "sale_items_sale_id_idx",
      "sale_items_product_id_idx",
      "purchase_items_purchase_id_idx",
      "purchase_items_product_id_idx",
      "customer_credit_movements_customer_id_idx",
      "customer_credit_movements_source_ref_idx",
      "stock_movements_source_ref_idx",
      "stock_movements_business_created_idx",
      "sales_customer_id_idx",
      "sales_business_created_idx",
      "expenses_business_created_idx",
      "expenses_branch_id_idx",
      "business_memberships_business_id_idx",
      "products_business_category_idx",
      "audit_logs_business_created_idx",
    ];

    const { rows } = await db.query<{ indexname: string }>(
      `select indexname from pg_indexes where schemaname = 'public';`
    );
    const existing = new Set(rows.map((r) => r.indexname));

    for (const idx of requiredIndexes) {
      expect(existing.has(idx), `Missing expected index: ${idx}`).toBe(true);
    }
  });

  it("enforces sale_items_quantity_positive check constraint", async () => {
    const saleRes = await db.query<{ id: string }>(
      `insert into sales (client_id, business_id, branch_id, subtotal, discount, total, created_at_local, created_by_user_id)
       values (gen_random_uuid(), '${bizA}', '${branchA}', 100, 0, 100, now(), '${ownerA}') returning id;`
    );
    const saleId = saleRes.rows[0].id;

    // Zero quantity must fail
    await expect(
      db.query(
        `insert into sale_items (sale_id, product_id, quantity, unit_price)
         values ('${saleId}', '${prodA}', 0, 100);`
      )
    ).rejects.toThrow(/sale_items_quantity_positive/);

    // Negative quantity must fail
    await expect(
      db.query(
        `insert into sale_items (sale_id, product_id, quantity, unit_price)
         values ('${saleId}', '${prodA}', -5, 100);`
      )
    ).rejects.toThrow(/sale_items_quantity_positive/);

    // Valid positive quantity must succeed
    const valid = await db.query(
      `insert into sale_items (sale_id, product_id, quantity, unit_price)
       values ('${saleId}', '${prodA}', 3, 100) returning id;`
    );
    expect(valid.rows.length).toBe(1);
  });

  it("enforces expenses_amount_positive check constraint", async () => {
    await expect(
      db.query(
        `insert into expenses (business_id, branch_id, category, amount, created_by_user_id)
         values ('${bizA}', '${branchA}', 'utilities', -50, '${ownerA}');`
      )
    ).rejects.toThrow(/expenses_amount_positive/);

    await expect(
      db.query(
        `insert into expenses (business_id, branch_id, category, amount, created_by_user_id)
         values ('${bizA}', '${branchA}', 'utilities', 0, '${ownerA}');`
      )
    ).rejects.toThrow(/expenses_amount_positive/);

    const valid = await db.query(
      `insert into expenses (business_id, branch_id, category, amount, created_by_user_id)
       values ('${bizA}', '${branchA}', 'utilities', 250, '${ownerA}') returning id;`
    );
    expect(valid.rows.length).toBe(1);
  });

  it("cascades deletion on inventory_stock_rollup when a product is deleted", async () => {
    const prodRes = await db.query<{ id: string }>(
      `insert into products (business_id, sku, name, sell_price, cost_price)
       values ('${bizA}', 'SKU-CASCADE-TEST', 'Cascade Item', 200, 100) returning id;`
    );
    const prodId = prodRes.rows[0].id;

    // Directly insert rollup row (simulating rollup state for this product)
    await db.query(`
      insert into inventory_stock_rollup (product_id, branch_id, quantity)
      values ('${prodId}', '${branchA}', 25);
    `);

    const rollupCheck = await db.query<{ quantity: number }>(
      `select quantity from inventory_stock_rollup where product_id = '${prodId}' and branch_id = '${branchA}';`
    );
    expect(rollupCheck.rows[0]?.quantity).toBe(25);

    // Delete product — cascades to inventory_stock_rollup cleanly
    await db.query(`delete from products where id = '${prodId}';`);

    const afterDelete = await db.query(
      `select * from inventory_stock_rollup where product_id = '${prodId}';`
    );
    expect(afterDelete.rows.length).toBe(0);

    // Verify ledger & sales immutability: products with sales or stock movements are protected from deletion
    await expect(
      db.query(`delete from products where id = '${prodA}';`)
    ).rejects.toThrow(/sale_items_product_id_fkey/);
  });

  it("allows Platform Admin and scoped Business Owner to select inventory_stock_rollup via RLS", async () => {
    // Add stock movement for prodA to generate rollup
    await db.query(`
      insert into stock_movements (client_id, business_id, branch_id, product_id, quantity_delta, source, created_at_local, created_by_user_id)
      values (gen_random_uuid(), '${bizA}', '${branchA}', '${prodA}', 50, 'initial_stock', now(), '${ownerA}');
    `);

    // Owner A selects rollup via view
    await actAs(ownerA);
    const ownerResult = await db.query(
      `select * from inventory_stock where product_id = '${prodA}';`
    );
    expect(ownerResult.rows.length).toBeGreaterThanOrEqual(1);

    // Platform Admin selects rollup via view
    await actAs(adminId);
    const adminResult = await db.query(
      `select * from inventory_stock where product_id = '${prodA}';`
    );
    expect(adminResult.rows.length).toBeGreaterThanOrEqual(1);
  });

});
