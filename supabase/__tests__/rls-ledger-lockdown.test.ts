import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

/**
 * RLS allow/deny tests for the direct-PostgREST-write bypass closed by
 * 20260808120000_lock_ledger_writes_to_sync_functions.sql (see that file's
 * comment, and the 2026-08-08 security review it fixes). Run against a real
 * Postgres engine (pglite), applying the shipped migration files verbatim.
 *
 * Postgres checks table-level GRANTs before RLS ever runs, so these tests
 * exercise both layers: `auth.uid()`/`request.jwt.claims` are stubbed the
 * same way Supabase's real Postgres does it, `authenticated` is given the
 * same broad default INSERT grant Supabase's platform bootstrap gives every
 * project (the thing that made the bypass possible), and then the lockdown
 * migration's explicit REVOKEs are applied on top — matching production
 * exactly, not a simplified stand-in.
 */

const migrationsDir = fileURLToPath(new URL("../migrations/", import.meta.url));

function readMigration(filename: string): string {
  return readFileSync(`${migrationsDir}${filename}`, "utf8");
}

/**
 * Every migration after the lockdown fix under test, applied in filename
 * order, so this suite runs against the actual current schema/policy set
 * rather than a hand-picked snapshot that silently goes stale as new
 * migrations land (the sync-apply-functions suite had exactly this bug: a
 * hardcoded list kept exercising a function a later migration had already
 * replaced in production).
 */
function laterMigrationFilenames(after: string): string[] {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql") && name > after)
    .sort();
}

let db: PGlite;
let bizId: string;
let ownerId: string;
let cashierId: string;
let branchId: string;
let productId: string;
let customerId: string;
let existingSaleId: string;

async function actAs(role: "authenticated" | "service_role", userId?: string) {
  await db.exec(`set role ${role};`);
  if (userId) {
    await db.exec(`set request.jwt.claims = '${JSON.stringify({ sub: userId, role })}';`);
  }
}

async function resetToSuperuser() {
  await db.exec(`reset role;`);
  await db.exec(`reset request.jwt.claims;`);
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });

  await db.exec(`create schema if not exists auth;`);
  await db.exec(`create table auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb default '{}'::jsonb);`);
  await db.exec(`
    create or replace function auth.uid() returns uuid as $$
      select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid
    $$ language sql stable;
  `);
  await db.exec(`
    do $$ begin
      if not exists (select from pg_roles where rolname = 'anon') then create role anon; end if;
      if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
      -- Real Supabase's service_role has BYPASSRLS; without it, RLS's null-on-no-match
      -- behavior would hide rows from service_role reads even after a permitted write.
      if not exists (select from pg_roles where rolname = 'service_role') then create role service_role bypassrls; end if;
    end $$;
  `);

  await db.exec(readMigration("20260807054724_init_schema.sql"));
  await db.exec(readMigration("20260807054734_rls_policies.sql"));
  await db.exec(readMigration("20260807081123_sync_apply_functions.sql"));

  // Supabase's platform bootstrap grants `authenticated` broad table
  // privileges by default (before any project-specific RLS/GRANT). Nothing
  // in this repo's migrations does this explicitly, so it's replicated here
  // to reproduce the exact condition the security review flagged.
  await db.exec(`grant usage on schema public to anon, authenticated, service_role;`);
  await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated;`);
  await db.exec(`grant all on all tables in schema public to service_role;`);

  // Now apply the fix under test.
  await db.exec(readMigration("20260808120000_lock_ledger_writes_to_sync_functions.sql"));

  // And every migration since, so assertions below run against the current
  // production schema/policies, not a frozen 2026-08-08 snapshot.
  for (const filename of laterMigrationFilenames("20260808120000_lock_ledger_writes_to_sync_functions.sql")) {
    await db.exec(readMigration(filename));
  }

  const owner = await db.query<{ id: string }>(`insert into auth.users default values returning id;`);
  ownerId = owner.rows[0].id;

  const biz = await db.query<{ id: string }>(`insert into business_profile (name, business_type, currency, status) values ('Test', 'general_retail', 'NGN', 'verified') returning id;`);
  bizId = biz.rows[0].id;

  await db.query(`insert into users (id, business_id, full_name, role, account_type) values ($1, $2, 'Test Owner', 'owner', 'BUSINESS_OWNER');`, [ownerId, bizId]);

  const cashier = await db.query<{ id: string }>(`insert into auth.users default values returning id;`);
  cashierId = cashier.rows[0].id;
  await db.query(`insert into users (id, business_id, full_name, role, account_type) values ($1, $2, 'Test Cashier', 'cashier', 'WORKER');`, [cashierId, bizId]);
  await db.query(`insert into business_memberships (user_id, business_id, role, type, account_type) values ($1, $2, 'owner', 'owner', 'BUSINESS_OWNER'), ($3, $2, 'cashier', 'worker', 'WORKER');`, [ownerId, bizId, cashierId]);

  const branch = await db.query<{ id: string }>(`insert into branches (business_id, name) values ($1, 'Main') returning id;`, [bizId]);
  branchId = branch.rows[0].id;
  await db.query(`insert into user_branches (user_id, branch_id, business_id) values ($1, $2, $3);`, [cashierId, branchId, bizId]);

  const product = await db.query<{ id: string }>(
    `insert into products (business_id, sku, name, cost_price, sell_price) values ($1, 'SKU-1', 'Widget', 100, 150) returning id;`,
    [bizId]
  );
  productId = product.rows[0].id;

  const customer = await db.query<{ id: string }>(`insert into customers (business_id, name) values ($1, 'Test Customer') returning id;`, [bizId]);
  customerId = customer.rows[0].id;

  // A pre-existing sale, owned by the cashier, for the sale_items/sale_payments cases.
  const sale = await db.query<{ id: string }>(
    `insert into sales (client_id, business_id, branch_id, subtotal, total, created_at_local, created_by_user_id)
     values (gen_random_uuid(), $1, $2, 100, 100, now(), $3) returning id;`,
    [bizId, branchId, cashierId]
  );
  existingSaleId = sale.rows[0].id;
});

afterEach(resetToSuperuser);

describe("ledger tables: direct authenticated INSERT is blocked (privilege revoked, RLS never reached)", () => {
  it("stock_movements: a cashier who passes the RLS role check is still refused at the grant layer", async () => {
    await actAs("authenticated", cashierId);
    await expect(
      db.query(
        `insert into stock_movements (client_id, business_id, branch_id, product_id, quantity_delta, source, created_at_local, created_by_user_id)
         values (gen_random_uuid(), $1, $2, $3, 500, 'sale', now(), $4);`,
        [bizId, branchId, productId, cashierId]
      )
    ).rejects.toThrow(/permission denied/i);
  });

  it("stock_adjustments: an inventory_staff-equivalent write is refused at the grant layer", async () => {
    await actAs("authenticated", ownerId);
    await expect(
      db.query(
        `insert into stock_adjustments (client_id, business_id, branch_id, product_id, quantity_delta, reason_code, created_by_user_id)
         values (gen_random_uuid(), $1, $2, $3, 100, 'recount', $4);`,
        [bizId, branchId, productId, ownerId]
      )
    ).rejects.toThrow(/permission denied/i);
  });

  it("sales: a cashier cannot fabricate a sale row directly", async () => {
    await actAs("authenticated", cashierId);
    await expect(
      db.query(
        `insert into sales (client_id, business_id, branch_id, subtotal, total, created_at_local, created_by_user_id)
         values (gen_random_uuid(), $1, $2, 1, 1, now(), $3);`,
        [bizId, branchId, cashierId]
      )
    ).rejects.toThrow(/permission denied/i);
  });

  it("sale_items: a cashier cannot append extra items to their own already-recorded sale", async () => {
    await actAs("authenticated", cashierId);
    await expect(
      db.query(
        `insert into sale_items (sale_id, product_id, quantity, unit_price) values ($1, $2, 1, 0.01);`,
        [existingSaleId, productId]
      )
    ).rejects.toThrow(/permission denied/i);
  });

  it("sale_payments: a cashier cannot attach a fabricated payment to their own sale", async () => {
    await actAs("authenticated", cashierId);
    await expect(
      db.query(`insert into sale_payments (sale_id, method, amount) values ($1, 'cash', 1);`, [existingSaleId])
    ).rejects.toThrow(/permission denied/i);
  });

  it("customer_credit_movements: a cashier cannot erase or fabricate customer debt directly", async () => {
    await actAs("authenticated", cashierId);
    await expect(
      db.query(
        `insert into customer_credit_movements (client_id, business_id, customer_id, amount_delta, created_at_local, created_by_user_id)
         values (gen_random_uuid(), $1, $2, -100000, now(), $3);`,
        [bizId, customerId, cashierId]
      )
    ).rejects.toThrow(/permission denied/i);
  });
});

describe("ledger tables: reads and the sync RPC path are unaffected", () => {
  it("authenticated can still select from a locked-down table (only INSERT was revoked)", async () => {
    await actAs("authenticated", cashierId);
    const result = await db.query(`select id from sales where id = $1;`, [existingSaleId]);
    expect(result.rows).toHaveLength(1);
  });

  it("service_role's sync_apply_sale RPC still writes to stock_movements despite the table-level revoke", async () => {
    await actAs("service_role");

    const saleId = crypto.randomUUID();
    const payload = {
      id: saleId,
      clientId: crypto.randomUUID(),
      branchId,
      customerId: null,
      payments: [{ method: "cash", amount: 150 }],
      subtotal: 150,
      discount: 0,
      total: 150,
      createdAtLocal: new Date().toISOString(),
      items: [
        {
          productId,
          quantity: 1,
          unitPrice: 150,
          discount: 0,
          movementClientId: crypto.randomUUID(),
        },
      ],
    };

    await db.query(`select sync_apply_sale($1::jsonb, $2::uuid);`, [JSON.stringify(payload), ownerId]);

    const movement = await db.query(`select id from stock_movements where source_reference_id = $1;`, [saleId]);
    expect(movement.rows).toHaveLength(1);
  });

  it("authenticated cannot even call sync_apply_sale directly (EXECUTE was already revoked before this fix)", async () => {
    await actAs("authenticated", ownerId);
    await expect(
      db.query(`select sync_apply_sale($1::jsonb, $2::uuid);`, [
        JSON.stringify({
          id: crypto.randomUUID(),
          clientId: crypto.randomUUID(),
          branchId,
          customerId: null,
          payments: [{ method: "cash", amount: 1 }],
          subtotal: 1,
          discount: 0,
          total: 1,
          createdAtLocal: new Date().toISOString(),
          items: [],
        }),
        ownerId,
      ])
    ).rejects.toThrow(/permission denied/i);
  });
});

describe("users_write: account_type must agree with the authoritative membership", () => {
  it("an owner can rename a worker (account_type unchanged matches membership)", async () => {
    await actAs("authenticated", ownerId);
    await db.query(`update users set full_name = 'Renamed' where id = $1;`, [cashierId]);
    await resetToSuperuser();
    const row = await db.query<{ full_name: string }>(`select full_name from users where id = $1;`, [cashierId]);
    expect(row.rows[0].full_name).toBe("Renamed");
    // restore
    await db.query(`update users set full_name = 'Test Cashier' where id = $1;`, [cashierId]);
  });

  it("an owner cannot write a users.account_type that contradicts the membership", async () => {
    await actAs("authenticated", ownerId);
    await expect(
      db.query(`update users set account_type = 'BUSINESS_OWNER' where id = $1;`, [cashierId])
    ).rejects.toThrow(/violates row-level security policy/i);
  });

  it("an owner cannot write a users.account_type onto a worker row to escalate", async () => {
    await actAs("authenticated", ownerId);
    await expect(
      db.query(`update users set role = 'owner', account_type = 'BUSINESS_OWNER' where id = $1;`, [cashierId])
    ).rejects.toThrow(/violates row-level security policy/i);
  });
});
