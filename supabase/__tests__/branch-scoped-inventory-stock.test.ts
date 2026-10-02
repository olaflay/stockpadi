import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { bootDatabase, type Tenant } from "./_harness.js";

/**
 * Proves inventory_stock_rollup is branch-scoped under RLS.
 *
 * The policy this test guards previously joined only on the tenant, using
 * auth_can_access_business, which says nothing about branches. Because
 * POS_SELL implies VIEW_PRODUCTS, that let the ordinary cashier read the stock
 * of every branch in the business straight out of PostgREST, bypassing the
 * application-level filters entirely.
 *
 * Every case below runs as `authenticated` against the real shipped migrations,
 * so a future policy edit that drops the branch predicate fails here rather
 * than shipping.
 */

let db: PGlite;
let tenant: Tenant;
let secondBranchId: string;
let cashierId: string;
let unprivilegedWorkerId: string;
let twoBranchWorkerId: string;

async function actAs(userId: string) {
  await db.exec("set role authenticated;");
  await db.exec(
    `set request.jwt.claims = '${JSON.stringify({ sub: userId, role: "authenticated" })}';`
  );
}

async function reset() {
  await db.exec("reset role;");
  await db.exec("reset request.jwt.claims;");
}

async function addBranch(name: string): Promise<string> {
  const result = await db.query<{ id: string }>(
    `insert into branches (business_id, name) values ($1, $2) returning id;`,
    [tenant.businessId, name]
  );
  return result.rows[0].id;
}

async function addStock(branchId: string, quantity: number) {
  await db.query(
    `insert into stock_movements (client_id, business_id, branch_id, product_id, quantity_delta, source, created_at_local, created_by_user_id)
     values (gen_random_uuid(), $1, $2, $3, $4, 'initial_stock', now(), $5);`,
    [tenant.businessId, branchId, tenant.productId, quantity, tenant.ownerId]
  );
}

async function seedWorker(permission: string | null, branchIds: string[]): Promise<string> {
  const user = await db.query<{ id: string }>(`insert into auth.users default values returning id;`);
  const workerId = user.rows[0].id;

  await db.query(
    `insert into users (id, business_id, full_name, role, account_type)
     values ($1, $2, 'Branch Cashier', 'cashier', 'WORKER');`,
    [workerId, tenant.businessId]
  );
  await db.query(
    `insert into business_memberships (user_id, business_id, account_type, status)
     values ($1, $2, 'WORKER', 'active');`,
    [workerId, tenant.businessId]
  );

  for (const branchId of branchIds) {
    await db.query(`insert into user_branches (user_id, business_id, branch_id) values ($1, $2, $3);`, [
      workerId,
      tenant.businessId,
      branchId,
    ]);
  }

  if (permission) {
    await db.query(
      `insert into worker_permissions (user_id, business_id, permission, enabled)
       values ($1, $2, $3, true);`,
      [workerId, tenant.businessId, permission]
    );
  }

  return workerId;
}

/** Branch ids whose stock the current role can actually read. */
async function readableBranchIds(): Promise<string[]> {
  const result = await db.query<{ branch_id: string }>(
    `select branch_id from inventory_stock where product_id = $1 order by branch_id;`,
    [tenant.productId]
  );
  return result.rows.map((row) => row.branch_id);
}

beforeAll(async () => {
  const booted = await bootDatabase();
  db = booted.pg;
  tenant = booted.tenant;

  secondBranchId = await addBranch("Second");
  await addStock(secondBranchId, 250);

  // The seeded tenant branch already holds 100 from the harness.
  cashierId = await seedWorker("POS_SELL", [tenant.branchId]);
  unprivilegedWorkerId = await seedWorker(null, [tenant.branchId, secondBranchId]);
  twoBranchWorkerId = await seedWorker("POS_SELL", [tenant.branchId, secondBranchId]);
});

describe("inventory_stock_rollup branch scope", () => {
  it("hides a second branch's stock from a cashier assigned to only one branch", async () => {
    await actAs(cashierId);
    const visible = await readableBranchIds();
    await reset();

    expect(visible).toEqual([tenant.branchId]);
    expect(visible).not.toContain(secondBranchId);
  });

  it("grants a cashier assigned to both branches both branches", async () => {
    await actAs(twoBranchWorkerId);
    const visible = await readableBranchIds();
    await reset();

    expect(visible.sort()).toEqual([tenant.branchId, secondBranchId].sort());
  });

  it("grants a worker with no stock capability nothing, even on assigned branches", async () => {
    await actAs(unprivilegedWorkerId);
    const visible = await readableBranchIds();
    await reset();

    expect(visible).toEqual([]);
  });

  it("keeps the owner able to read every branch, as documented", async () => {
    await actAs(tenant.ownerId);
    const visible = await readableBranchIds();
    await reset();

    expect(visible.sort()).toEqual([tenant.branchId, secondBranchId].sort());
  });

  it("returns the same branch-scoped rows from the base table as from the view", async () => {
    await actAs(cashierId);
    const viaView = await readableBranchIds();
    const viaTable = await db.query<{ branch_id: string }>(
      `select branch_id from inventory_stock_rollup where product_id = $1 order by branch_id;`,
      [tenant.productId]
    );
    await reset();

    expect(viaTable.rows.map((row) => row.branch_id)).toEqual(viaView);
  });
});
