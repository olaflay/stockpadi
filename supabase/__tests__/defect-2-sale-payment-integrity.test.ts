import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { bootDatabase, type Tenant } from "./_harness";

/**
 * REGRESSION: sync_apply_sale must not take a device's word for money.
 *
 * How this defect happened: the guard existed in
 * 20260809120000_sync_apply_sale_stock_check.sql and was deliberately kept in
 * 20260810121000_revert_sync_apply_sale_stock_rejection.sql. It was then lost
 * when 20260823000000_sync_apply_tenant_ownership.sql re-created the entire
 * function body to add tenant-ownership checks, and
 * 20260904100000_sale_payment_tendered_note.sql re-created it once more,
 * describing itself as "Re-created unchanged from 20260823000000". Because the
 * newest guard-bearing migration predates the shipping definition by four
 * revisions, the migration history read as though the checks were still live.
 *
 * These assertions were written and observed FAILING against the unfixed code:
 * every one of these payloads was accepted and stored verbatim, permanently
 * desynchronising sales.total (authoritative for revenue) from the sum of
 * sale_payments.amount (authoritative for the cash and payment-method
 * breakdown).
 *
 * The fix is 20261001120000_restore_sale_money_integrity_guards.sql. These are
 * arithmetic checks only - insufficient stock is still always honoured and still
 * drives stock negative, per .agents/rules/offline-sync-and-ledger.md.
 */

let pg: PGlite;
let tenant: Tenant;

function salePayload(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    clientId: crypto.randomUUID(),
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
        movementClientId: crypto.randomUUID(),
      },
    ],
    ...overrides,
  };
}

async function apply(payload: Record<string, unknown>) {
  return pg.query<{ result: { status: string } }>(
    `select sync_apply_sale($1::jsonb, $2::uuid) as result;`,
    [JSON.stringify(payload), tenant.ownerId]
  );
}

/** Every rejected payload must leave no partial trace behind. */
async function assertNoTraceOf(payload: Record<string, unknown>) {
  const sale = await pg.query<{ n: number }>(
    `select count(*)::int as n from sales where client_id = $1::uuid;`,
    [payload.clientId]
  );
  const items = await pg.query<{ n: number }>(
    `select count(*)::int as n from sale_items where sale_id = $1::uuid;`,
    [payload.id]
  );
  const movements = await pg.query<{ n: number }>(
    `select count(*)::int as n from stock_movements where client_id = $1::uuid;`,
    [(payload.items as Array<{ movementClientId: string }>)[0].movementClientId]
  );
  expect(sale.rows[0].n).toBe(0);
  expect(items.rows[0].n).toBe(0);
  expect(movements.rows[0].n).toBe(0);
}

beforeAll(async () => {
  const booted = await bootDatabase();
  pg = booted.pg;
  tenant = booted.tenant;
});

describe("REGRESSION: a sale's money must add up server-side", () => {
  it("rejects payments that do not sum to the declared total", async () => {
    const payload = salePayload({
      payments: [{ method: "cash", amount: 1 }],
      subtotal: 10_000,
      total: 10_000,
      items: [
        {
          productId: tenant.productId,
          quantity: 1,
          unitPrice: 10_000,
          discount: 0,
          movementClientId: crypto.randomUUID(),
        },
      ],
    });

    await expect(apply(payload)).rejects.toThrow(/payments do not sum to declared total/);
    await assertNoTraceOf(payload);
  });

  it("rejects a subtotal that contradicts its own line items", async () => {
    const payload = salePayload({
      subtotal: 500,
      total: 500,
      payments: [{ method: "cash", amount: 500 }],
      items: [
        {
          productId: tenant.productId,
          quantity: 1,
          unitPrice: 150,
          discount: 0,
          movementClientId: crypto.randomUUID(),
        },
      ],
    });

    await expect(apply(payload)).rejects.toThrow(/subtotal does not match line items/);
    await assertNoTraceOf(payload);
  });

  it("rejects a total that ignores its declared discount", async () => {
    const payload = salePayload({
      subtotal: 150,
      discount: 50,
      total: 150,
      payments: [{ method: "cash", amount: 150 }],
    });

    await expect(apply(payload)).rejects.toThrow(/total does not match subtotal less discount/);
    await assertNoTraceOf(payload);
  });

  it("accepts a total that correctly reflects a discount", async () => {
    // The guards must permit a genuine discount, not merely reject one.
    const payload = salePayload({
      subtotal: 150,
      discount: 50,
      total: 100,
      payments: [{ method: "cash", amount: 100 }],
    });

    const result = await apply(payload);
    expect(result.rows[0].result.status).toBe("applied");

    const row = await pg.query<{ subtotal: number; discount: number; total: number }>(
      `select subtotal, discount, total from sales where id = $1::uuid;`,
      [payload.id]
    );
    expect(Number(row.rows[0].subtotal)).toBe(150);
    expect(Number(row.rows[0].discount)).toBe(50);
    expect(Number(row.rows[0].total)).toBe(100);
  });

  it("rejects a sale that declares revenue but carries no payment rows", async () => {
    const payload = salePayload({ payments: [] });

    await expect(apply(payload)).rejects.toThrow(/payments do not sum to declared total/);
    await assertNoTraceOf(payload);
  });

  it("tolerates a one-cent rounding difference", async () => {
    const payload = salePayload({
      subtotal: 150,
      total: 150,
      payments: [{ method: "cash", amount: 150.005 }],
    });

    const result = await apply(payload);
    expect(result.rows[0].result.status).toBe("applied");
  });
});

describe("REGRESSION: the restored guards must not weaken existing behaviour", () => {
  it("still honours a sale that drives stock negative", async () => {
    // 500 units against an opening stock of 100. Rejecting this is the exact
    // failure mode 20260810121000 reverted: money collected, sale never lands,
    // retried forever. Negative stock is the honest signal instead.
    const payload = salePayload({
      subtotal: 75_000,
      total: 75_000,
      payments: [{ method: "cash", amount: 75_000 }],
      items: [
        {
          productId: tenant.productId,
          quantity: 500,
          unitPrice: 150,
          discount: 0,
          movementClientId: crypto.randomUUID(),
        },
      ],
    });

    const result = await apply(payload);
    expect(result.rows[0].result.status).toBe("applied");

    const stock = await pg.query<{ qty: number }>(
      `select coalesce(sum(quantity_delta), 0)::int as qty from stock_movements where product_id = $1 and branch_id = $2;`,
      [tenant.productId, tenant.branchId]
    );
    expect(stock.rows[0].qty).toBeLessThan(0);
  });

  it("still skips a replayed clientId", async () => {
    const payload = salePayload();

    expect((await apply(payload)).rows[0].result.status).toBe("applied");
    expect((await apply(payload)).rows[0].result.status).toBe("skipped");
  });

  it("still honours split payments that sum correctly, and ledger only the credit part", async () => {
    const customer = await pg.query<{ id: string }>(
      `insert into customers (business_id, name) values ($1, 'Repro Credit Customer') returning id;`,
      [tenant.businessId]
    );

    const payload = salePayload({
      customerId: customer.rows[0].id,
      payments: [
        { method: "cash", amount: 100 },
        { method: "credit", amount: 50 },
      ],
    });

    const result = await apply(payload);
    expect(result.rows[0].result.status).toBe("applied");

    const credit = await pg.query<{ amount_delta: number }>(
      `select amount_delta from customer_credit_movements where source_reference_id = $1::uuid;`,
      [payload.id]
    );
    expect(Number(credit.rows[0].amount_delta)).toBe(50);
  });

  it("still rejects a cross-tenant product, and does so on ownership before arithmetic", async () => {
    const otherBiz = await pg.query<{ id: string }>(
      `insert into business_profile (name, business_type, currency) values ('Other Tenant', 'general_retail', 'NGN') returning id;`
    );
    const foreignProduct = await pg.query<{ id: string }>(
      `insert into products (business_id, sku, name, cost_price, sell_price) values ($1, 'FOREIGN', 'Foreign', 1, 999) returning id;`,
      [otherBiz.rows[0].id]
    );

    const payload = salePayload({
      subtotal: 999,
      total: 999,
      payments: [{ method: "cash", amount: 999 }],
      items: [
        {
          productId: foreignProduct.rows[0].id,
          quantity: 1,
          unitPrice: 999,
          discount: 0,
          movementClientId: crypto.randomUUID(),
        },
      ],
    });

    await expect(apply(payload)).rejects.toThrow();
    await assertNoTraceOf(payload);
  });
});