import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { bootDatabase, type Tenant } from "./_harness";

/**
 * BLOCKER B3: Immutable Cost Snapshot on sale_items.
 *
 * TRUST Promise 4: Profit figures are consistent.
 * Derivation: docs/COSTING-AND-PRICING.md.
 */

let pg: PGlite;
let tenant: Tenant;

function makeSalePayload(overrides: Record<string, unknown> = {}) {
  const saleId = crypto.randomUUID();
  return {
    id: saleId,
    clientId: saleId,
    branchId: tenant.branchId,
    customerId: null,
    payments: [{ method: "cash", amount: 1500 }],
    subtotal: 1500,
    discount: 0,
    total: 1500,
    createdAtLocal: new Date().toISOString(),
    items: [
      {
        productId: tenant.productId,
        quantity: 10,
        unitPrice: 150,
        discount: 0,
        unitLabel: "piece",
        conversionFactor: 1,
        movementClientId: crypto.randomUUID(),
        unitCost: 100,
        costBasis: "snapshot",
        productVersion: 1,
        costFlags: [],
      },
    ],
    ...overrides,
  };
}

async function applySale(payload: Record<string, unknown>) {
  return pg.query<{ result: { status: string; id: string } }>(
    `select sync_apply_sale($1::jsonb, $2::uuid) as result;`,
    [JSON.stringify(payload), tenant.ownerId]
  );
}

beforeAll(async () => {
  const booted = await bootDatabase();
  pg = booted.pg;
  tenant = booted.tenant;

  // Set standard cost_price = 100 for tenant.productId
  await pg.query(`update products set cost_price = 100, version = 1 where id = $1`, [tenant.productId]);
});

describe("BLOCKER B3: sale_items cost snapshot immutability", () => {
  it("persists unit_cost, cost_basis, product_version, and cost_flags on sync_apply_sale", async () => {
    const payload = makeSalePayload();
    const res = await applySale(payload);
    expect(res.rows[0].result.status).toBe("applied");

    const items = await pg.query<{
      unit_cost: string;
      cost_basis: string;
      product_version: number;
      cost_flags: string[];
    }>(
      `select unit_cost, cost_basis, product_version, cost_flags from sale_items where sale_id = $1`,
      [payload.id]
    );

    expect(items.rows).toHaveLength(1);
    expect(Number(items.rows[0].unit_cost)).toBe(100);
    expect(items.rows[0].cost_basis).toBe("snapshot");
    expect(items.rows[0].product_version).toBe(1);
    expect(items.rows[0].cost_flags).toEqual([]);
  });

  it("historical sale_items cost does not change when product cost is modified", async () => {
    const payload = makeSalePayload();
    await applySale(payload);

    // Modify product's cost to 200 and version to 2
    await pg.query(`update products set cost_price = 200, version = 2 where id = $1`, [tenant.productId]);

    // Check sale line
    const items = await pg.query<{ unit_cost: string; product_version: number }>(
      `select unit_cost, product_version from sale_items where sale_id = $1`,
      [payload.id]
    );

    expect(Number(items.rows[0].unit_cost)).toBe(100);
    expect(items.rows[0].product_version).toBe(1);
  });

  it("accepts out-of-band cost (> ±10%) and flags it as out_of_band without silent substitution", async () => {
    // Current product cost is 200. Client reports 150 (outside 180..220 band).
    const payload = makeSalePayload({
      items: [
        {
          productId: tenant.productId,
          quantity: 5,
          unitPrice: 300,
          discount: 0,
          unitLabel: "piece",
          conversionFactor: 1,
          movementClientId: crypto.randomUUID(),
          unitCost: 150,
        },
      ],
    });

    const res = await applySale(payload);
    expect(res.rows[0].result.status).toBe("applied");

    const items = await pg.query<{
      unit_cost: string;
      cost_basis: string;
      cost_flags: string[];
    }>(
      `select unit_cost, cost_basis, cost_flags from sale_items where sale_id = $1`,
      [payload.id]
    );

    expect(Number(items.rows[0].unit_cost)).toBe(150);
    expect(items.rows[0].cost_basis).toBe("snapshot");
    expect(items.rows[0].cost_flags).toContain("out_of_band");
  });

  it("leaves unit_cost and cost_basis as NULL for legacy sales without snapshot (never fabricates backfill)", async () => {
    const payload = makeSalePayload({
      items: [
        {
          productId: tenant.productId,
          quantity: 2,
          unitPrice: 750,
          discount: 0,
          unitLabel: "piece",
          conversionFactor: 1,
          movementClientId: crypto.randomUUID(),
          // unitCost omitted
        },
      ],
    });

    const res = await applySale(payload);
    expect(res.rows[0].result.status).toBe("applied");

    const items = await pg.query<{
      unit_cost: string | null;
      cost_basis: string | null;
      product_version: number;
    }>(
      `select unit_cost, cost_basis, product_version from sale_items where sale_id = $1`,
      [payload.id]
    );

    const prod = await pg.query<{ version: number }>(`select version from products where id = $1`, [tenant.productId]);
    expect(items.rows[0].unit_cost).toBeNull();
    expect(items.rows[0].cost_basis).toBeNull();
    expect(items.rows[0].product_version).toBe(prod.rows[0].version);
  });
});
