import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { bootDatabase, type Tenant } from "./_harness";

/**
 * BLOCKER B4: Batch sync execution with SAVEPOINT isolation.
 *
 * TRUST Promise 1 & 7: Offline operation and sync resilience.
 * Derivation: questions.md Q1 & docs/LAUNCH_SCOPE.md.
 */

let pg: PGlite;
let tenant: Tenant;

beforeAll(async () => {
  const booted = await bootDatabase();
  pg = booted.pg;
  tenant = booted.tenant;
});

describe("BLOCKER B4: sync_apply_batch", () => {
  it("executes a batch of 100 sales in a single call without timeouts", async () => {
    const salesBatch = [];
    for (let i = 0; i < 100; i++) {
      const saleId = crypto.randomUUID();
      salesBatch.push({
        type: "sale",
        client_id: `sale-batch-${i}`,
        mutation_id: `mut-${i}`,
        payload: {
          id: saleId,
          clientId: saleId,
          branchId: tenant.branchId,
          customerId: null,
          payments: [{ method: "cash", amount: 150 }],
          subtotal: 150,
          discount: 0,
          total: 150,
          createdAtLocal: new Date().toISOString(),
          items: [
            {
              productId: tenant.productId,
              quantity: 1,
              unitPrice: 150,
              discount: 0,
              unitCost: 100,
              movementClientId: crypto.randomUUID(),
            },
          ],
        },
      });
    }

    const t0 = Date.now();
    const res = await pg.query<{ results: Array<{ status: string; clientId: string }> }>(
      `select sync_apply_batch($1::jsonb, $2::uuid) as results;`,
      [JSON.stringify(salesBatch), tenant.ownerId]
    );
    const duration = Date.now() - t0;

    const results = res.rows[0].results;
    expect(results).toHaveLength(100);
    expect(results.every((r) => r.status === "applied")).toBe(true);
    // 100 items should complete well under 5 seconds
    expect(duration).toBeLessThan(5000);
  });

  it("handles idempotent batch replay cleanly with skipped statuses", async () => {
    const saleId = crypto.randomUUID();
    const batch = [
      {
        type: "sale",
        client_id: `replay-sale-1`,
        payload: {
          id: saleId,
          clientId: saleId,
          branchId: tenant.branchId,
          customerId: null,
          payments: [{ method: "cash", amount: 150 }],
          subtotal: 150,
          discount: 0,
          total: 150,
          createdAtLocal: new Date().toISOString(),
          items: [
            {
              productId: tenant.productId,
              quantity: 1,
              unitPrice: 150,
              discount: 0,
              unitCost: 100,
              movementClientId: crypto.randomUUID(),
            },
          ],
        },
      },
    ];

    // First push
    const res1 = await pg.query<{ results: Array<{ status: string }> }>(
      `select sync_apply_batch($1::jsonb, $2::uuid) as results;`,
      [JSON.stringify(batch), tenant.ownerId]
    );
    expect(res1.rows[0].results[0].status).toBe("applied");

    // Second push (idempotent replay)
    const res2 = await pg.query<{ results: Array<{ status: string }> }>(
      `select sync_apply_batch($1::jsonb, $2::uuid) as results;`,
      [JSON.stringify(batch), tenant.ownerId]
    );
    expect(res2.rows[0].results[0].status).toBe("skipped");
  });

  it("isolates failures via SAVEPOINT so corrupt mutations do not abort sibling writes", async () => {
    const mixedBatch = [
      {
        type: "expense",
        client_id: "expense-valid-1",
        payload: {
          id: crypto.randomUUID(),
          branchId: tenant.branchId,
          category: "Cleaning",
          amount: 25,
          createdAtLocal: new Date().toISOString(),
        },
      },
      {
        type: "sale",
        client_id: "sale-invalid-2",
        payload: {
          id: crypto.randomUUID(),
          clientId: crypto.randomUUID(),
          branchId: tenant.branchId,
          // Corrupt: declared total 500, payments only sum to 200
          payments: [{ method: "cash", amount: 200 }],
          subtotal: 500,
          discount: 0,
          total: 500,
          createdAtLocal: new Date().toISOString(),
          items: [
            { productId: tenant.productId, quantity: 1, unitPrice: 500, movementClientId: crypto.randomUUID() },
          ],
        },
      },
      {
        type: "expense",
        client_id: "expense-valid-3",
        payload: {
          id: crypto.randomUUID(),
          branchId: tenant.branchId,
          category: "Utilities",
          amount: 40,
          createdAtLocal: new Date().toISOString(),
        },
      },
    ];

    const res = await pg.query<{ results: Array<{ status: string; clientId: string; error?: { code: string } }> }>(
      `select sync_apply_batch($1::jsonb, $2::uuid) as results;`,
      [JSON.stringify(mixedBatch), tenant.ownerId]
    );

    const results = res.rows[0].results;
    expect(results).toHaveLength(3);
    expect(results[0].status).toBe("applied");
    expect(results[1].status).toBe("permanent_failure");
    expect(results[1].error?.code).toBe("VALIDATION_ERROR");
    expect(results[2].status).toBe("applied");
  });
});
