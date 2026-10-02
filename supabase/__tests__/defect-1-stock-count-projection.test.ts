import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import {
  bootDatabase,
  countRows,
  rollupQuantity,
  rollupUpdatedAt,
  seedCountableWorker,
  type Tenant,
} from "./_harness";

/**
 * DEFECT 1 (server half) — a stock-count submission produces no inventory
 * projection change.
 *
 * sync_apply_stock_count is a review workflow: it records the counted quantity
 * against the expected quantity with review='pending' and deliberately does not
 * touch stock_movements, because stock only moves when an owner approves. The
 * inventory_stock_rollup table is maintained exclusively by the
 * stock_movements_bump_rollup trigger, so a submission cannot and must not bump
 * it.
 *
 * This suite pins that fact down. It is the server half of a two-sided defect:
 * because the projection never changes, any client that waits for an inventory
 * pull to confirm a stock count waits forever. See the client half in
 * frontend/src/features/sync/__tests__/stock-count-confirmation.test.ts.
 */

let pg: PGlite;
let tenant: Tenant;
let workerId: string;

function countPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: crypto.randomUUID(),
    clientId: crypto.randomUUID(),
    branchId: tenant.branchId,
    productId: tenant.productId,
    countedQuantity: 137,
    reasonCode: "cycle_count",
    note: "aisle 3",
    createdAtLocal: new Date().toISOString(),
    ...overrides,
  };
}

beforeAll(async () => {
  const booted = await bootDatabase();
  pg = booted.pg;
  tenant = booted.tenant;
  workerId = await seedCountableWorker(pg, tenant);
});

describe("DEFECT 1: sync_apply_stock_count never changes the inventory projection", () => {
  it("records the submission and reports applied", async () => {
    const result = await pg.query<{ result: { status: string; review?: string } }>(
      `select sync_apply_stock_count($1::jsonb, $2::uuid) as result;`,
      [JSON.stringify(countPayload()), workerId]
    );

    expect(result.rows[0].result.status).toBe("applied");
    expect(result.rows[0].result.review).toBe("pending");
    expect(
      await countRows(pg, `select count(*)::int as n from stock_count_submissions;`)
    ).toBe(1);
  });

  it("writes zero stock movements, so stock is unchanged by design", async () => {
    await pg.query(
      `insert into stock_movements (client_id, business_id, branch_id, product_id, quantity_delta, source, created_at_local, created_by_user_id)
       values (gen_random_uuid(), $1, $2, $3, 999, 'adjustment', now(), $4);`,
      [tenant.businessId, tenant.branchId, tenant.productId, workerId]
    );

    const before = await rollupQuantity(pg, tenant.productId, tenant.branchId);

    await pg.query(`select sync_apply_stock_count($1::jsonb, $2::uuid);`, [
      JSON.stringify(countPayload({ countedQuantity: 42 })),
      workerId,
    ]);

    const after = await rollupQuantity(pg, tenant.productId, tenant.branchId);

    expect(after).toBe(before);
  });

  it("leaves the rollup's updated_at untouched, so an incremental pull can never re-return this key", async () => {
    const before = await rollupUpdatedAt(pg, tenant.productId, tenant.branchId);
    expect(before).not.toBeNull();

    await pg.query(`select sync_apply_stock_count($1::jsonb, $2::uuid);`, [
      JSON.stringify(countPayload({ countedQuantity: 7 })),
      workerId,
    ]);

    const after = await rollupUpdatedAt(pg, tenant.productId, tenant.branchId);

    // If this assertion ever fails, the two halves of the defect have
    // desynchronised: the server started moving the projection, so a client
    // waiting on an inventory confirmation would no longer deadlock.
    expect(after).toBe(before);
  });

  it("is idempotent on client_id, returning skipped rather than double-recording", async () => {
    const payload = countPayload({ countedQuantity: 55 });
    await pg.query(`select sync_apply_stock_count($1::jsonb, $2::uuid);`, [
      JSON.stringify(payload),
      workerId,
    ]);

    const retry = await pg.query<{ result: { status: string } }>(
      `select sync_apply_stock_count($1::jsonb, $2::uuid) as result;`,
      [JSON.stringify(payload), workerId]
    );

    expect(retry.rows[0].result.status).toBe("skipped");
    expect(
      await countRows(
        pg,
        `select count(*)::int as n from stock_count_submissions where client_id = '${payload.clientId}';`
      )
    ).toBe(1);
  });
});