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
    const clientRefundId = "11111111-1111-4111-8111-111111111111";
    const refundResult = await db.query<{ refund_sale: { status: string; refundId: string; totalRefunded: number; restoredStock: number } }>(
      `select public.refund_sale(
        $1::uuid,
        $2::uuid,
        $3::uuid,
        $4::uuid,
        $5::jsonb,
        $6::jsonb,
        'Customer returned 1 defective unit'
      ) as refund_sale;`,
      [
        clientRefundId,
        saleId,
        tenant.ownerId,
        tenant.businessId,
        JSON.stringify([{ product_id: tenant.productId, quantity: 1 }]),
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

    // A lost response followed by an identical retry returns the committed
    // result and produces no second ledger event.
    const retry = await db.query<{ refund_sale: { alreadyApplied: boolean; refundId: string; totalRefunded: number } }>(
      `select public.refund_sale($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::jsonb, $6::jsonb, $7) as refund_sale;`,
      [clientRefundId, saleId, tenant.ownerId, tenant.businessId, JSON.stringify([{ product_id: tenant.productId, quantity: 1 }]), JSON.stringify([{ method: "cash", amount: 2500 }]), "Customer returned 1 defective unit"]
    );
    expect(retry.rows[0].refund_sale.alreadyApplied).toBe(true);
    expect(retry.rows[0].refund_sale.refundId).toBe(refundId);
    expect((await db.query<{ n: number }>(`select count(*)::int as n from public.sale_refunds where sale_id = $1`, [saleId])).rows[0].n).toBe(1);
    expect((await db.query<{ n: number }>(`select count(*)::int as n from public.stock_movements where source_reference_id = $1 and source = 'sale_refund'`, [refundId])).rows[0].n).toBe(1);

    // The client cannot manufacture a one-naira refund by sending a fake unit
    // price: the RPC derives the line amount from the original sale and rejects
    // a payment allocation that does not match it.
    await expect(db.query(
      `select public.refund_sale($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::jsonb, $6::jsonb, 'Tampered amount');`,
      ["44444444-4444-4444-8444-444444444444", saleId, tenant.ownerId, tenant.businessId, JSON.stringify([{ product_id: tenant.productId, quantity: 1, unit_price: 1 }]), JSON.stringify([{ method: "cash", amount: 1 }])]
    )).rejects.toThrow("do not match");

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
          $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::jsonb, $6::jsonb,
          'Should fail on excessive quantity'
        );`,
        [
          "22222222-2222-4222-8222-222222222222",
          saleId,
          tenant.ownerId,
          tenant.businessId,
          JSON.stringify([{ product_id: tenant.productId, quantity: 2 }]),
          JSON.stringify([{ method: "cash", amount: 5000 }]),
        ]
      )
    ).rejects.toThrow("exceeds");

    // 7. Refunding with empty reason must fail
    await expect(
      db.query(
        `select public.refund_sale(
          $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::jsonb, $6::jsonb, '  '
        );`,
        [
          "33333333-3333-4333-8333-333333333333",
          saleId,
          tenant.ownerId,
          tenant.businessId,
          JSON.stringify([{ product_id: tenant.productId, quantity: 1 }]),
          JSON.stringify([{ method: "cash", amount: 2500 }]),
        ]
      )
    ).rejects.toThrow("mandatory");
  });

  it("reverses a credit refund exactly once and never permits an over-refund", async () => {
    const customer = await db.query<{ id: string }>(
      `insert into public.customers (business_id, name) values ($1, 'Refund Customer') returning id;`,
      [tenant.businessId]
    );
    const customerId = customer.rows[0].id;
    const saleResult = await db.query<{ id: string }>(
      `insert into public.sales (client_id, business_id, branch_id, customer_id, subtotal, discount, total, created_at_local, created_by_user_id)
       values (gen_random_uuid(), $1, $2, $3, 300, 0, 300, now(), $4) returning id;`,
      [tenant.businessId, tenant.branchId, customerId, tenant.ownerId]
    );
    const saleId = saleResult.rows[0].id;
    await db.query(`insert into public.sale_items (sale_id, product_id, quantity, unit_price, discount) values ($1, $2, 2, 150, 0);`, [saleId, tenant.productId]);
    await db.query(`insert into public.sale_payments (sale_id, method, amount) values ($1, 'credit', 300);`, [saleId]);
    await db.query(`insert into public.customer_credit_movements (client_id, business_id, customer_id, amount_delta, source_reference_id, created_at_local, created_by_user_id) values (gen_random_uuid(), $1, $2, 300, $3, now(), $4);`, [tenant.businessId, customerId, saleId, tenant.ownerId]);

    const intentId = "55555555-5555-4555-8555-555555555555";
    const call = () => db.query<{ refund_sale: { totalRefunded: number; restoredStock: number } }>(
      `select public.refund_sale($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::jsonb, $6::jsonb, 'Credit return') as refund_sale;`,
      [intentId, saleId, tenant.ownerId, tenant.businessId, JSON.stringify([{ product_id: tenant.productId, quantity: 1 }]), JSON.stringify([{ method: "credit", amount: 150 }])]
    );
    expect((await call()).rows[0].refund_sale).toMatchObject({ totalRefunded: 150, restoredStock: 1 });
    expect((await call()).rows[0].refund_sale).toMatchObject({ totalRefunded: 150 });
    expect((await db.query<{ balance: string }>(`select sum(amount_delta)::numeric as balance from public.customer_credit_movements where customer_id = $1`, [customerId])).rows[0].balance).toBe("150.00");
    await expect(db.query(
      `select public.refund_sale($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::jsonb, $6::jsonb, 'Over return');`,
      ["66666666-6666-4666-8666-666666666666", saleId, tenant.ownerId, tenant.businessId, JSON.stringify([{ product_id: tenant.productId, quantity: 2 }]), JSON.stringify([{ method: "credit", amount: 300 }])]
    )).rejects.toThrow("exceeds");
  });

  it("allocates line discounts from the original sale instead of another product", async () => {
    const saleResult = await db.query<{ id: string }>(
      `insert into public.sales (client_id, business_id, branch_id, subtotal, discount, total, created_at_local, created_by_user_id)
       values (gen_random_uuid(), $1, $2, 200, 20, 180, now(), $3) returning id;`,
      [tenant.businessId, tenant.branchId, tenant.ownerId]
    );
    const saleId = saleResult.rows[0].id;
    const secondProduct = await db.query<{ id: string }>(
      `insert into public.products (business_id, name, sku, cost_price, sell_price) values ($1, 'Discounted Product', 'DISC-1', 30, 100) returning id;`,
      [tenant.businessId]
    );
    await db.query(
      `insert into public.sale_items (sale_id, product_id, quantity, unit_price, discount)
       values ($1, $2, 1, 100, 20), ($1, $3, 1, 100, 0);`,
      [saleId, tenant.productId, secondProduct.rows[0].id]
    );
    await db.query(
      `insert into public.sale_payments (sale_id, method, amount) values ($1, 'cash', 180);`,
      [saleId]
    );

    const result = await db.query<{ refund_sale: { totalRefunded: number } }>(
      `select public.refund_sale($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::jsonb, $6::jsonb, 'Line discount return') as refund_sale;`,
      [
        "77777777-7777-4777-8777-777777777777",
        saleId,
        tenant.ownerId,
        tenant.businessId,
        JSON.stringify([{ product_id: tenant.productId, quantity: 1 }]),
        JSON.stringify([{ method: "cash", amount: 80 }]),
      ]
    );

    expect(result.rows[0].refund_sale.totalRefunded).toBe(80);
    const refundLine = await db.query<{ total: string }>(
      `select total from public.sale_refund_items where product_id = $1 and refund_id = $2`,
      [tenant.productId, "77777777-7777-4777-8777-777777777777"]
    );
    expect(refundLine.rows[0].total).toBe("80.00");
  });
});
