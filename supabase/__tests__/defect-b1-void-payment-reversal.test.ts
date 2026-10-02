import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { bootDatabase, type Tenant } from "./_harness.js";

/**
 * Verification for Blocker B1:
 * Proves that calling void_sale() atomically marks sale_payments.voided_at,
 * preventing voided sales from leaking revenue into cash reconciliation.
 */

let db: PGlite;
let tenant: Tenant;

beforeAll(async () => {
  const booted = await bootDatabase();
  db = booted.pg;
  tenant = booted.tenant;
});

describe("Blocker B1 — void_sale payment leg reversal", () => {
  it("atomically marks sale_payments as voided when voiding a sale", async () => {
    // 1. Post a test sale directly
    const saleResult = await db.query<{ id: string }>(
      `insert into public.sales (client_id, business_id, branch_id, subtotal, discount, total, created_at_local, created_by_user_id)
       values (gen_random_uuid(), $1, $2, 5000, 0, 5000, now(), $3)
       returning id;`,
      [tenant.businessId, tenant.branchId, tenant.ownerId]
    );
    const saleId = saleResult.rows[0].id;

    // 2. Post sale item
    await db.query(
      `insert into public.sale_items (sale_id, product_id, quantity, unit_price, discount)
       values ($1, $2, 5, 1000, 0);`,
      [saleId, tenant.productId]
    );

    // 3. Post stock movement for sale
    await db.query(
      `insert into public.stock_movements (client_id, business_id, branch_id, product_id, quantity_delta, source, source_reference_id, created_at_local, created_by_user_id)
       values (gen_random_uuid(), $1, $2, $3, -5, 'sale', $4, now(), $5);`,
      [tenant.businessId, tenant.branchId, tenant.productId, saleId, tenant.ownerId]
    );

    // 4. Post split payment: 3000 cash + 2000 transfer
    await db.query(
      `insert into public.sale_payments (sale_id, method, amount)
       values ($1, 'cash', 3000), ($1, 'transfer', 2000);`,
      [saleId]
    );

    // Verify payments initially active
    const activePaymentsBefore = await db.query<{ count: number }>(
      `select count(*)::int as count from public.sale_payments where sale_id = $1 and voided_at is null;`,
      [saleId]
    );
    expect(activePaymentsBefore.rows[0].count).toBe(2);

    // 5. Execute atomic void_sale RPC
    const voidResult = await db.query<{ void_sale: { status: string; reversedPayments: number; reversedMovements: number } }>(
      `select public.void_sale($1, $2, $3, 'Customer returned goods') as void_sale;`,
      [saleId, tenant.ownerId, tenant.businessId]
    );

    expect(voidResult.rows[0].void_sale.status).toBe("ok");
    expect(voidResult.rows[0].void_sale.reversedPayments).toBe(2);
    expect(voidResult.rows[0].void_sale.reversedMovements).toBe(1);

    // 6. Verify sale is marked voided
    const saleCheck = await db.query<{ voided_at: string | null; void_reason: string }>(
      `select voided_at, void_reason from public.sales where id = $1;`,
      [saleId]
    );
    expect(saleCheck.rows[0].voided_at).not.toBeNull();
    expect(saleCheck.rows[0].void_reason).toBe("Customer returned goods");

    // 7. Verify stock reversal created
    const stockReversals = await db.query<{ quantity_delta: number; source: string }>(
      `select quantity_delta, source from public.stock_movements where source_reference_id = $1 and source = 'sale_void';`,
      [saleId]
    );
    expect(stockReversals.rows).toHaveLength(1);
    expect(stockReversals.rows[0].quantity_delta).toBe(5);

    // 8. Verify active payments now 0 (all marked voided)
    const activePaymentsAfter = await db.query<{ count: number }>(
      `select count(*)::int as count from public.sale_payments where sale_id = $1 and voided_at is null;`,
      [saleId]
    );
    expect(activePaymentsAfter.rows[0].count).toBe(0);

    const voidedPayments = await db.query<{ voided_at: string | null }>(
      `select voided_at from public.sale_payments where sale_id = $1;`,
      [saleId]
    );
    expect(voidedPayments.rows).toHaveLength(2);
    expect(voidedPayments.rows[0].voided_at).not.toBeNull();
    expect(voidedPayments.rows[1].voided_at).not.toBeNull();

    // 9. Re-attempting to void must fail
    await expect(
      db.query(
        `select public.void_sale($1, $2, $3, 'Duplicate void attempt');`,
        [saleId, tenant.ownerId, tenant.businessId]
      )
    ).rejects.toThrow("already voided");
  });
});
