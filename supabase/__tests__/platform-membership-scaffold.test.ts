import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

/**
 * Regression coverage for 20260815120000_platform_and_membership_scaffold.sql:
 *  - backfill produces exactly one business_memberships row per non-super_admin
 *    users row, and one platform_admins row per super_admin;
 *  - business_memberships_select cannot leak Business A's rows into a
 *    Business B session;
 *  - suspending a business (business_profile.status) never touches an
 *    individual membership's status, and vice versa.
 * Same real-Postgres-via-pglite approach as rls-ledger-lockdown.test.ts.
 */

const migrationsDir = fileURLToPath(new URL("../migrations/", import.meta.url));
function readMigration(filename: string): string {
  return readFileSync(`${migrationsDir}${filename}`, "utf8");
}

let db: PGlite;
let bizA: string;
let bizB: string;
let ownerA: string;
let ownerB: string;
let superAdminId: string;

async function actAs(userId: string) {
  await db.exec("set role authenticated;");
  await db.exec(`set request.jwt.claims = '${JSON.stringify({ sub: userId, role: "authenticated" })}';`);
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

  // Apply every migration in filename order up to and including the one
  // under test, so this runs against the real accumulated schema.
  const filenames = [
    "20260807054724_init_schema.sql",
    "20260807054734_rls_policies.sql",
    "20260807081123_sync_apply_functions.sql",
    "20260807090000_sync_apply_credit_payment.sql",
    "20260807100000_sync_apply_expense.sql",
    "20260807110000_sync_apply_supplier.sql",
    "20260808120000_lock_ledger_writes_to_sync_functions.sql",
    "20260808150000_email_verification.sql",
    "20260809120000_sync_apply_sale_stock_check.sql",
    "20260809121500_fix_owner_admin_role_escalation.sql",
    "20260809122000_email_verification_attempt_limit.sql",
    "20260809125900_super_admin_role_enum.sql",
    "20260809130000_super_admin.sql",
    "20260809140000_block_super_admin_self_grant.sql",
    "20260810120000_fix_purchase_items_write_tenant_scope.sql",
    "20260810121000_revert_sync_apply_sale_stock_rejection.sql",
    "20260810122000_atomic_void_sale.sql",
    "20260810123000_drop_unused_supplier_balance.sql",
    "20260810124000_inventory_stock_rollup.sql",
  ];

  for (const filename of filenames) {
    await db.exec(readMigration(filename));
  }

  await db.exec("grant usage on schema public to anon, authenticated, service_role;");
  await db.exec("grant select, insert, update, delete on all tables in schema public to authenticated;");
  await db.exec("grant all on all tables in schema public to service_role;");

  // Seed pre-existing data BEFORE applying the migration under test, so the
  // backfill runs against real rows exactly like a production deploy would.
  const oA = await db.query<{ id: string }>("insert into auth.users default values returning id;");
  ownerA = oA.rows[0].id;
  const bA = await db.query<{ id: string }>(
    "insert into business_profile (name, business_type, currency) values ('Biz A', 'general_retail', 'NGN') returning id;"
  );
  bizA = bA.rows[0].id;
  await db.query("insert into users (id, business_id, full_name, role, is_active) values ($1, $2, 'Owner A', 'owner', true);", [
    ownerA,
    bizA,
  ]);

  const oB = await db.query<{ id: string }>("insert into auth.users default values returning id;");
  ownerB = oB.rows[0].id;
  const bB = await db.query<{ id: string }>(
    "insert into business_profile (name, business_type, currency, is_active) values ('Biz B', 'general_retail', 'NGN', false) returning id;"
  );
  bizB = bB.rows[0].id;
  await db.query("insert into users (id, business_id, full_name, role, is_active) values ($1, $2, 'Owner B', 'owner', false);", [
    ownerB,
    bizB,
  ]);

  // handle_new_owner's system-business bootstrap only fires from the auth
  // trigger; insert the system business row directly for this seed, before
  // the super_admin user row that references it.
  await db.query(
    `insert into business_profile (id, name, business_type, currency) values
     ('00000000-0000-0000-0000-000000000000', 'StockPadi System', 'general_retail', 'NGN')
     on conflict (id) do nothing;`
  );
  const sa = await db.query<{ id: string }>("insert into auth.users default values returning id;");
  superAdminId = sa.rows[0].id;
  await db.query(
    "insert into users (id, business_id, full_name, role, is_active) values ($1, '00000000-0000-0000-0000-000000000000', 'Super Admin', 'super_admin', true);",
    [superAdminId]
  );

  // Now apply the migration under test.
  await db.exec(readMigration("20260815120000_platform_and_membership_scaffold.sql"));
});

afterEach(resetToSuperuser);

describe("platform_and_membership_scaffold backfill", () => {
  it("creates exactly one business_memberships row per non-super_admin users row", async () => {
    const rows = await db.query<{ user_id: string; business_id: string; role: string; status: string }>(
      "select user_id, business_id, role, status from business_memberships order by user_id;"
    );
    expect(rows.rows).toHaveLength(2);
    const a = rows.rows.find((r) => r.user_id === ownerA)!;
    expect(a.business_id).toBe(bizA);
    expect(a.role).toBe("owner");
    expect(a.status).toBe("active");

    const b = rows.rows.find((r) => r.user_id === ownerB)!;
    expect(b.business_id).toBe(bizB);
    expect(b.status).toBe("disabled"); // is_active=false on the users row backfills to disabled
  });

  it("creates exactly one platform_admins row per super_admin, none for tenant users", async () => {
    const rows = await db.query<{ user_id: string; status: string }>("select user_id, status from platform_admins;");
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].user_id).toBe(superAdminId);
    expect(rows.rows[0].status).toBe("active");
  });

  it("backfills business_profile.status from is_active: true -> verified, false -> suspended", async () => {
    const rows = await db.query<{ id: string; status: string }>("select id, status from business_profile where id in ($1, $2);", [
      bizA,
      bizB,
    ]);
    const a = rows.rows.find((r) => r.id === bizA)!;
    const b = rows.rows.find((r) => r.id === bizB)!;
    expect(a.status).toBe("verified");
    expect(b.status).toBe("suspended");
  });

  it("business suspension does not alter an individual membership's status, and vice versa", async () => {
    await resetToSuperuser();
    await db.exec("set role service_role;");
    // Suspend Biz A entirely.
    await db.query("update business_profile set status = 'suspended' where id = $1;", [bizA]);
    // Owner A's own membership status must be untouched by that.
    const membership = await db.query<{ status: string }>(
      "select status from business_memberships where user_id = $1 and business_id = $2;",
      [ownerA, bizA]
    );
    expect(membership.rows[0].status).toBe("active");

    // And disabling a single membership must not alter business status.
    await db.query("update business_memberships set status = 'disabled' where user_id = $1 and business_id = $2;", [ownerA, bizA]);
    const biz = await db.query<{ status: string }>("select status from business_profile where id = $1;", [bizA]);
    expect(biz.rows[0].status).toBe("suspended"); // unchanged by the membership update
  });
});

describe("business_memberships_select tenant isolation", () => {
  it("Owner B cannot read Owner A's membership row", async () => {
    await actAs(ownerB);
    const rows = await db.query<{ user_id: string }>("select user_id from business_memberships;");
    expect(rows.rows.every((r) => r.user_id === ownerB)).toBe(true);
    expect(rows.rows.some((r) => r.user_id === ownerA)).toBe(false);
  });

  it("a platform admin can read membership rows across both businesses", async () => {
    await actAs(superAdminId);
    const rows = await db.query<{ user_id: string }>("select user_id from business_memberships order by user_id;");
    const ids = rows.rows.map((r) => r.user_id).sort();
    expect(ids).toEqual([ownerA, ownerB].sort());
  });
});
