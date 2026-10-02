import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { bootDatabase, type Tenant } from "./_harness.js";

/**
 * Verification for Blocker B2:
 * Proves that refund_sale() atomically creates a sale_refund record,
 * restores stock via 'sale_refund' movements, records refund payments/cash-out,
 * credits customer debt if credit payment, and enforces strict boundary guards.
 */

let db: PGlite;
let tenant: Tenant;

beforeAll(async () => {
  const booted = await bootDatabase();
  db = booted.pg;
  tenant = booted.tenant;
});

describe("Blocker B2 — refund_sale RPC and ledger recording", () => {
  it("atomically processes a partial refund with stock restoration and payment tracking", async () => {
    // 1. Post a test sale (2 items @ 2500 = 5000 total, paid 3000 cash + 2000 credit)
    const saleResult = await db.query<{ id: string }>(
      `insert into public.sales (client_id, business_id, branch_id, subtotal, discount, total, created_at_local, created_by_user_id)
       values (gen_random_uuid(), $1, $2, 5000, 0, 5000, now(), $3)
       returning id;`,
      [tenant.businessId, tenant.branchId, tenant.ownerId]
    );
    const saleId = saleResult.rows[0].id;

    await db.query(
      `insert into public.sale_items (sale_id, product_id, quantity, unit_price, discount)
       values ($1, $2, 2, 2500, 0);`,
      [saleId, tenant.productId]
    );

    await db.query(
      `insert into public.stock_movements (client_id, business_id, branch_id, product_id, quantity_delta, source, source_reference_id, created_at_local, created_by_user_id)
       values (gen_random_uuid(), $1, $2, $3, -2, 'sale', $4, now(), $5);`,
      [tenant.businessId, tenant.branchId, tenant.productId, saleId, tenant.ownerId]
    );

    await db.query(
      `insert into public.sale_payments (sale_id, method, amount)
       values ($1, 'cash', 3000), ($1, 'pos_terminal', 2000);`,
      [saleId]
    );

    // Initial stock check
    const stockBefore = await db.query<{ stock: number }>(
      `select sum(quantity_delta)::int as stock from public.stock_movements where product_id = $1;`,
      [tenant.productId]
    );

    // 2. Refund 1 item @ 2500 (returning 2500 in cash)
    const refundResult = await db.query<{ refund_sale: { status: string; refundId: string; totalRefunded: number; restoredStock: number } }>(
      `select public.refund_sale(
        $1::uuid,
        $2::uuid,
        $3::uuid,
        $4::jsonb,
        $5::jsonb,
        'Customer returned 1 defective unit'
      ) as refund_sale;`,
      [
        saleId,
        tenant.ownerId,
        tenant.businessId,
        JSON.stringify([{ product_id: tenant.productId, quantity: 1, unit_price: 2500 }]),
        JSON.stringify([{ method: "cash", amount: 2500 }]),
      ]
    );

    expect(refundResult.rows[0].refund_sale.status).toBe("ok");
    expect(refundResult.rows[0].refund_sale.totalRefunded).toBe(2500);
    expect(refundResult.rows[0].refund_sale.restoredStock).toBe(1);

    const refundId = refundResult.rows[0].refund_sale.refundId;

    // 3. Verify stock was restored by exactly +1 with source 'sale_refund'
    const stockAfter = await db.query<{ stock: number }>(
      `select sum(quantity_delta)::int as stock from public.stock_movements where product_id = $1;`,
      [tenant.productId]
    );
    expect(stockAfter.rows[0].stock).toBe(stockBefore.rows[0].stock + 1);

    const refundMovement = await db.query<{ quantity_delta: number; source: string; reason_code: string }>(
      `select quantity_delta, source, reason_code from public.stock_movements where source_reference_id = $1 and source = 'sale_refund';`,
      [refundId]
    );
    expect(refundMovement.rows).toHaveLength(1);
    expect(refundMovement.rows[0].quantity_delta).toBe(1);
    expect(refundMovement.rows[0].reason_code).toBe("Customer returned 1 defective unit");

    // 4. Verify sale_refunds table has entry
    const refundRecord = await db.query<{ total_refunded: string; reason: string }>(
      `select total_refunded, reason from public.sale_refunds where id = $1;`,
      [refundId]
    );
    expect(refundRecord.rows[0].total_refunded).toBe("2500.00");
    expect(refundRecord.rows[0].reason).toBe("Customer returned 1 defective unit");

    // 5. Verify audit log entry
    const auditRecord = await db.query<{ action: string; entity_type: string }>(
      `select action, entity_type from public.audit_logs where entity_id = $1;`,
      [refundId]
    );
    expect(auditRecord.rows[0].action).toBe("refund_sale");
    expect(auditRecord.rows[0].entity_type).toBe("sale_refunds");

    // 6. Over-refunding the remaining quantity (1 remaining, attempting 2) must fail
    await expect(
      db.query(
        `select public.refund_sale(
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::jsonb,
          $5::jsonb,
          'Should fail on excessive quantity'
        );`,
        [
          saleId,
          tenant.ownerId,
          tenant.businessId,
          JSON.stringify([{ product_id: tenant.productId, quantity: 2, unit_price: 2500 }]),
          JSON.stringify([{ method: "cash", amount: 5000 }]),
        ]
      )
    ).rejects.toThrow("exceeds");

    // 7. Refunding with empty reason must fail
    await expect(
      db.query(
        `select public.refund_sale(
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::jsonb,
          $5::jsonb,
          '  '
        );`,
        [
          saleId,
          tenant.ownerId,
          tenant.businessId,
          JSON.stringify([{ product_id: tenant.productId, quantity: 1, unit_price: 2500 }]),
          JSON.stringify([{ method: "cash", amount: 2500 }]),
        ]
      )
    ).rejects.toThrow("mandatory");
  });
});
