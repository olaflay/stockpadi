import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * The mandatory two-device concurrent-write test for the server-side sync
 * merge functions (sync_apply_sale, sync_apply_stock_adjustment,
 * sync_apply_product), run against a real Postgres engine (pglite: Postgres
 * compiled to WASM, not a mock), not the app's own Dexie/IndexedDB layer.
 * See .agents/skills/write-offline-conflict-test.md and
 * .agents/rules/offline-sync-and-ledger.md.
 *
 * Applies the real migration files verbatim, no rewritten copy, so this test
 * fails the moment the shipped SQL drifts from what it verifies. Supabase's
 * `auth` schema and API roles (anon/authenticated/service_role) don't exist
 * in plain Postgres, so a minimal stand-in is created here; that stand-in
 * plays no role in the assertions below, which exercise sync_apply_*
 * directly with an explicit actor_id, the same way the sync-push Edge
 * Function calls them after independently authorizing the caller.
 */

const migrationsDir = fileURLToPath(new URL("../migrations/", import.meta.url));

function readMigration(filename: string): string {
  return readFileSync(`${migrationsDir}${filename}`, "utf8");
}

/**
 * Applies every migration in the directory, in filename order, rather than a
 * hand-picked subset — a hardcoded list silently goes stale the moment a new
 * migration replaces a function under test (this happened: a later
 * migration replaced sync_apply_sale, and this test kept exercising the
 * superseded definition, passing against behavior nothing in production
 * still runs). Includes the RLS-policy migration too, since sync_apply_*
 * functions and later migrations reference its auth_business_id()/
 * auth_role() helpers; harmless here since this suite never `set role`s
 * away from the pglite superuser, so RLS itself stays inert.
 */
function allMigrationFilenames(): string[] {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

let db: PGlite;
let actorId: string;
let branchId: string;
let productId: string;

async function currentStock(product: string, branch: string): Promise<number> {
  const result = await db.query<{ qty: number }>(
    `select coalesce(sum(quantity_delta), 0)::int as qty from stock_movements where product_id = $1 and branch_id = $2`,
    [product, branch]
  );
  return result.rows[0].qty;
}

function salePayload(overrides: {
  id: string;
  clientId: string;
  movementClientId: string;
  quantity?: number;
  customerId?: string | null;
  payments?: Array<{ method: string; amount: number }>;
}) {
  return {
    id: overrides.id,
    clientId: overrides.clientId,
    branchId,
    customerId: overrides.customerId ?? null,
    payments: overrides.payments ?? [{ method: "cash", amount: 150 }],
    subtotal: 150,
    discount: 0,
    total: 150,
    createdAtLocal: new Date().toISOString(),
    items: [
      {
        productId,
        quantity: overrides.quantity ?? 1,
        unitPrice: 150,
        discount: 0,
        movementClientId: overrides.movementClientId,
      },
    ],
  };
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
      if not exists (select from pg_roles where rolname = 'service_role') then create role service_role; end if;
    end $$;
  `);

  for (const filename of allMigrationFilenames()) {
    await db.exec(readMigration(filename));
  }

  const actor = await db.query<{ id: string }>(`insert into auth.users default values returning id;`);
  actorId = actor.rows[0].id;

  const biz = await db.query<{ id: string }>(`insert into business_profile (name, business_type, currency) values ('Test', 'general_retail', 'NGN') returning id;`);
  const bizId = biz.rows[0].id;

  await db.query(`insert into users (id, business_id, full_name, role) values ($1, $2, 'Test Owner', 'owner');`, [actorId, bizId]);

  const branch = await db.query<{ id: string }>(`insert into branches (business_id, name) values ($1, 'Main') returning id;`, [bizId]);
  branchId = branch.rows[0].id;

  const product = await db.query<{ id: string }>(
    `insert into products (business_id, sku, name, cost_price, sell_price) values ($1, 'SKU-1', 'Widget', 100, 150) returning id;`,
    [bizId]
  );
  productId = product.rows[0].id;

  await db.query(
    `insert into stock_movements (client_id, business_id, branch_id, product_id, quantity_delta, source, created_at_local, created_by_user_id)
     values (gen_random_uuid(), $1, $2, $3, 1, 'initial_stock', now(), $4);`,
    [bizId, branchId, productId, actorId]
  );
});

describe("sync_apply_sale: two-device concurrent sale", () => {
  it("honors both sales when device A applies before device B", async () => {
    const saleA = { id: crypto.randomUUID(), clientId: crypto.randomUUID(), movementClientId: crypto.randomUUID() };
    const saleB = { id: crypto.randomUUID(), clientId: crypto.randomUUID(), movementClientId: crypto.randomUUID() };

    await db.query(`select sync_apply_sale($1::jsonb, $2::uuid);`, [
      JSON.stringify(salePayload(saleA)),
      actorId,
    ]);
    await db.query(`select sync_apply_sale($1::jsonb, $2::uuid);`, [
      JSON.stringify(salePayload(saleB)),
      actorId,
    ]);

    expect(await currentStock(productId, branchId)).toBe(-1);
  });

  it("honors both sales when device B applies before device A (order must not change the result)", async () => {
    await db.query(`delete from sale_items;`);
    await db.query(`delete from sales;`);
    await db.query(`delete from stock_movements where source = 'sale';`);

    const saleC = { id: crypto.randomUUID(), clientId: crypto.randomUUID(), movementClientId: crypto.randomUUID() };
    const saleD = { id: crypto.randomUUID(), clientId: crypto.randomUUID(), movementClientId: crypto.randomUUID() };

    await db.query(`select sync_apply_sale($1::jsonb, $2::uuid);`, [
      JSON.stringify(salePayload(saleD)),
      actorId,
    ]);
    await db.query(`select sync_apply_sale($1::jsonb, $2::uuid);`, [
      JSON.stringify(salePayload(saleC)),
      actorId,
    ]);

    expect(await currentStock(productId, branchId)).toBe(-1);

    // Simulate a dropped connection mid-upload and a retry of the exact same
    // batch item (same clientId): must not double-apply or double-count.
    const retry = await db.query<{ result: { status: string } }>(
      `select sync_apply_sale($1::jsonb, $2::uuid) as result;`,
      [JSON.stringify(salePayload(saleC)), actorId]
    );
    expect(retry.rows[0].result.status).toBe("skipped");
    expect(await currentStock(productId, branchId)).toBe(-1);

    const movementRows = await db.query<{ n: number }>(
      `select count(*)::int as n from stock_movements where client_id = $1;`,
      [saleC.movementClientId]
    );
    expect(movementRows.rows[0].n).toBe(1);

    const itemRows = await db.query<{ n: number }>(`select count(*)::int as n from sale_items;`);
    const movementCountForSale = await db.query<{ n: number }>(
      `select count(*)::int as n from stock_movements where source = 'sale';`
    );
    expect(itemRows.rows[0].n).toBe(2);
    expect(movementCountForSale.rows[0].n).toBe(2);
  });
});

describe("sync_apply_sale: split payments and the credit ledger", () => {
  it("records one sale_payments row per method and only ledgers the credit-tagged portion", async () => {
    await db.query(`delete from sale_payments;`);
    await db.query(`delete from sale_items;`);
    await db.query(`delete from sales;`);
    await db.query(`delete from customer_credit_movements;`);
    await db.query(`delete from stock_movements where source = 'sale';`);

    const user = await db.query<{ business_id: string }>(`select business_id from users where id = $1`, [actorId]);
    const bizId = user.rows[0].business_id;

    const customer = await db.query<{ id: string }>(
      `insert into customers (business_id, name) values ($1, 'Chidinma Okafor') returning id;`,
      [bizId]
    );
    const customerId = customer.rows[0].id;

    const sale = { id: crypto.randomUUID(), clientId: crypto.randomUUID(), movementClientId: crypto.randomUUID() };
    await db.query(`select sync_apply_sale($1::jsonb, $2::uuid);`, [
      JSON.stringify(
        salePayload({
          ...sale,
          customerId,
          payments: [
            { method: "cash", amount: 100 },
            { method: "credit", amount: 50 },
          ],
        })
      ),
      actorId,
    ]);

    const payments = await db.query<{ method: string; amount: string }>(
      `select method, amount from sale_payments where sale_id = $1 order by method;`,
      [sale.id]
    );
    expect(payments.rows).toEqual([
      { method: "cash", amount: "100.00" },
      { method: "credit", amount: "50.00" },
    ]);

    // This is the exact gap that made a credit sale's debt uncollectible
    // before this fix: the sale recorded fine, but no ledger entry existed
    // for the customer to owe against.
    const ledger = await db.query<{ amount_delta: string; source_reference_id: string }>(
      `select amount_delta, source_reference_id from customer_credit_movements where customer_id = $1;`,
      [customerId]
    );
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0].amount_delta).toBe("50.00");
    expect(ledger.rows[0].source_reference_id).toBe(sale.id);
  });
});

describe("sync_apply_stock_adjustment: idempotent retry", () => {
  it("applies once and writes exactly one audit log row, even if the batch is retried", async () => {
    const adjustmentId = crypto.randomUUID();
    const adjustmentClientId = crypto.randomUUID();
    const payload = {
      id: adjustmentId,
      clientId: adjustmentClientId,
      branchId,
      productId,
      quantityDelta: 5,
      reasonCode: "recount",
      note: "Shelf recount",
      createdAtLocal: new Date().toISOString(),
    };

    await db.query(`select sync_apply_stock_adjustment($1::jsonb, $2::uuid);`, [
      JSON.stringify(payload),
      actorId,
    ]);
    await db.query(`select sync_apply_stock_adjustment($1::jsonb, $2::uuid);`, [
      JSON.stringify(payload),
      actorId,
    ]);

    const adjustmentRows = await db.query<{ n: number }>(
      `select count(*)::int as n from stock_adjustments where client_id = $1;`,
      [adjustmentClientId]
    );
    const auditRows = await db.query<{ n: number }>(
      `select count(*)::int as n from audit_logs where entity_id = $1;`,
      [adjustmentId]
    );

    expect(adjustmentRows.rows[0].n).toBe(1);
    expect(auditRows.rows[0].n).toBe(1);
  });
});

describe("sync_apply_product: last-write-wins with a conflict flag", () => {
  it("applies the incoming write either way, but flags conflict when the device's starting version is stale", async () => {
    const snapshot = await db.query<{ version: number }>(`select version from products where id = $1;`, [
      productId,
    ]);
    const startVersion = snapshot.rows[0].version;

    const basePayload = {
      id: productId,
      sku: "SKU-1",
      barcode: null,
      name: "Widget",
      categoryId: null,
      brandId: null,
      unitLabel: "piece",
      costPrice: 100,
      expiryTracking: "off",
    };

    const first = await db.query<{ result: { conflict: boolean } }>(
      `select sync_apply_product($1::jsonb, $2::uuid) as result;`,
      [JSON.stringify({ ...basePayload, sellPrice: 175, version: startVersion }), actorId]
    );
    expect(first.rows[0].result.conflict).toBe(false);

    // A second device that started from the same original version, but
    // syncs after the first device already bumped it.
    const second = await db.query<{ result: { conflict: boolean } }>(
      `select sync_apply_product($1::jsonb, $2::uuid) as result;`,
      [JSON.stringify({ ...basePayload, sellPrice: 160, version: startVersion }), actorId]
    );
    expect(second.rows[0].result.conflict).toBe(true);
  });
});

describe("tenant-ownership isolation across sync_apply_*", () => {
  let foreignActorId: string;
  let foreignBranchId: string;
  let foreignProductId: string;
  let foreignCustomerId: string;
  let foreignSupplierId: string;

  beforeAll(async () => {
    const actor = await db.query<{ id: string }>(`insert into auth.users default values returning id;`);
    foreignActorId = actor.rows[0].id;
    const biz = await db.query<{ id: string }>(`insert into business_profile (name, business_type, currency) values ('Foreign', 'general_retail', 'NGN') returning id;`);
    const bizId = biz.rows[0].id;
    await db.query(`insert into users (id, business_id, full_name, role) values ($1, $2, 'Foreign Owner', 'owner');`, [foreignActorId, bizId]);
    const branch = await db.query<{ id: string }>(`insert into branches (business_id, name) values ($1, 'Foreign Branch') returning id;`, [bizId]);
    foreignBranchId = branch.rows[0].id;
    const product = await db.query<{ id: string }>(`insert into products (business_id, sku, name, cost_price, sell_price) values ($1, 'FOREIGN-SKU', 'Foreign Widget', 100, 150) returning id;`, [bizId]);
    foreignProductId = product.rows[0].id;
    const customer = await db.query<{ id: string }>(`insert into customers (business_id, name) values ($1, 'Foreign Customer') returning id;`, [bizId]);
    foreignCustomerId = customer.rows[0].id;
    const supplier = await db.query<{ id: string }>(`insert into suppliers (business_id, name) values ($1, 'Foreign Supplier') returning id;`, [bizId]);
    foreignSupplierId = supplier.rows[0].id;
  });

  async function expectRejected(fn: () => Promise<unknown>, errcode: string) {
    try {
      await fn();
      throw new Error("expected the statement to be rejected");
    } catch (e) {
      const code = (e as { code?: string }).code;
      expect(code).toBe(errcode);
    }
  }

  it("rejects a sale that references another business's branch", async () => {
    await expectRejected(async () => {
      await db.query(`select sync_apply_sale($1::jsonb, $2::uuid);`, [
        JSON.stringify({
          ...salePayload({
            id: crypto.randomUUID(),
            clientId: crypto.randomUUID(),
            movementClientId: crypto.randomUUID(),
          }),
          branchId: foreignBranchId,
        }),
        actorId,
      ]);
    }, "42501");
  });

  it("rejects a sale that references another business's product", async () => {
    await expectRejected(async () => {
      await db.query(`select sync_apply_sale($1::jsonb, $2::uuid);`, [
        JSON.stringify({
          id: crypto.randomUUID(),
          clientId: crypto.randomUUID(),
          branchId,
          customerId: null,
          payments: [{ method: "cash", amount: 150 }],
          subtotal: 150,
          discount: 0,
          total: 150,
          createdAtLocal: new Date().toISOString(),
          items: [{ productId: foreignProductId, quantity: 1, unitPrice: 150, discount: 0, movementClientId: crypto.randomUUID() }],
        }),
        actorId,
      ]);
    }, "42501");
  });

  it("rejects a stock adjustment against another business's branch or product", async () => {
    await expectRejected(async () => {
      await db.query(`select sync_apply_stock_adjustment($1::jsonb, $2::uuid);`, [
        JSON.stringify({
          id: crypto.randomUUID(), clientId: crypto.randomUUID(), branchId: foreignBranchId,
          productId, quantityDelta: -1, reasonCode: "recount", note: null, createdAtLocal: new Date().toISOString(),
        }),
        actorId,
      ]);
    }, "42501");
    await expectRejected(async () => {
      await db.query(`select sync_apply_stock_adjustment($1::jsonb, $2::uuid);`, [
        JSON.stringify({
          id: crypto.randomUUID(), clientId: crypto.randomUUID(), branchId,
          productId: foreignProductId, quantityDelta: -1, reasonCode: "recount", note: null, createdAtLocal: new Date().toISOString(),
        }),
        actorId,
      ]);
    }, "42501");
  });

  it("rejects a credit payment against another business's customer", async () => {
    await expectRejected(async () => {
      await db.query(`select sync_apply_credit_payment($1::jsonb, $2::uuid);`, [
        JSON.stringify({
          id: crypto.randomUUID(), clientId: crypto.randomUUID(), customerId: foreignCustomerId,
          amount: 50, note: null, createdAtLocal: new Date().toISOString(),
        }),
        actorId,
      ]);
    }, "42501");
  });

  it("rejects a purchase receipt against another business's supplier", async () => {
    await expectRejected(async () => {
      await db.query(`select sync_apply_purchase_receipt($1::jsonb, $2::uuid);`, [
        JSON.stringify({
          id: crypto.randomUUID(), clientId: crypto.randomUUID(), branchId, supplierId: foreignSupplierId,
          createdAtLocal: new Date().toISOString(),
          items: [{ productId, quantity: 1, unitCost: 100, movementClientId: crypto.randomUUID() }],
        }),
        actorId,
      ]);
    }, "42501");
  });

  it("rejects an upsert that would overwrite another business's customer", async () => {
    await expectRejected(async () => {
      await db.query(`select sync_apply_customer($1::jsonb, $2::uuid);`, [
        JSON.stringify({ id: foreignCustomerId, name: "Hijacked", phone: null, updatedAt: new Date().toISOString() }),
        actorId,
      ]);
    }, "42501");
  });

  it("rejects a product upsert that would overwrite another business's product", async () => {
    await expectRejected(async () => {
      await db.query(`select sync_apply_product(($1::jsonb), $2::uuid);`, [
        JSON.stringify({ id: foreignProductId, sku: "FOREIGN-SKU", barcode: null, name: "Hijacked", categoryId: null, brandId: null, unitLabel: "piece", costPrice: 100, sellPrice: 150, expiryTracking: "off", version: 1 }),
        actorId,
      ]);
    }, "42501");
  });

  it("rejects a supplier upsert that would overwrite another business's supplier", async () => {
    await expectRejected(async () => {
      await db.query(`select sync_apply_supplier($1::jsonb, $2::uuid);`, [
        JSON.stringify({ id: foreignSupplierId, name: "Hijacked", phone: null }),
        actorId,
      ]);
    }, "42501");
  });

  it("rejects an expense against another business's branch", async () => {
    await expectRejected(async () => {
      await db.query(`select sync_apply_expense($1::jsonb, $2::uuid);`, [
        JSON.stringify({ id: crypto.randomUUID(), branchId: foreignBranchId, category: "Gen", amount: 10, note: null }),
        actorId,
      ]);
    }, "42501");
  });
});

describe("inventory_stock_rollup: trigger-maintained aggregate stays exact", () => {
  it("matches a raw SUM(quantity_delta) over the ledger after concurrent sales, including a retried duplicate", async () => {
    // A fresh product so this test doesn't depend on cleanup done by earlier
    // describe blocks (several of which delete stock_movements directly,
    // which — like every other real deletion of a ledger row — this
    // suite treats as out of scope, since production never deletes from
    // stock_movements; see 20260810124000_inventory_stock_rollup.sql).
    const user = await db.query<{ business_id: string }>(`select business_id from users where id = $1`, [actorId]);
    const bizId = user.rows[0].business_id;
    const product = await db.query<{ id: string }>(
      `insert into products (business_id, sku, name, cost_price, sell_price) values ($1, 'SKU-ROLLUP', 'Rollup Widget', 100, 150) returning id;`,
      [bizId]
    );
    const rollupProductId = product.rows[0].id;

    await db.query(
      `insert into stock_movements (client_id, business_id, branch_id, product_id, quantity_delta, source, created_at_local, created_by_user_id)
       values (gen_random_uuid(), $1, $2, $3, 20, 'initial_stock', now(), $4);`,
      [bizId, branchId, rollupProductId, actorId]
    );

    const saleA = { id: crypto.randomUUID(), clientId: crypto.randomUUID(), movementClientId: crypto.randomUUID() };
    const saleB = { id: crypto.randomUUID(), clientId: crypto.randomUUID(), movementClientId: crypto.randomUUID() };
    const payloadFor = (sale: typeof saleA, quantity: number) => {
      const total = quantity * 150;
      return {
        ...salePayload(sale),
        subtotal: total,
        total,
        payments: [{ method: "cash", amount: total }],
        items: [{ productId: rollupProductId, quantity, unitPrice: 150, discount: 0, movementClientId: sale.movementClientId }],
      };
    };

    await db.query(`select sync_apply_sale($1::jsonb, $2::uuid);`, [JSON.stringify(payloadFor(saleA, 3)), actorId]);
    await db.query(`select sync_apply_sale($1::jsonb, $2::uuid);`, [JSON.stringify(payloadFor(saleB, 4)), actorId]);
    // A retried sync of an already-applied sale must not double-count.
    await db.query(`select sync_apply_sale($1::jsonb, $2::uuid);`, [JSON.stringify(payloadFor(saleA, 3)), actorId]);

    const ledgerSum = await currentStock(rollupProductId, branchId);
    expect(ledgerSum).toBe(13); // 20 - 3 - 4

    const rollup = await db.query<{ quantity: number }>(
      `select quantity from inventory_stock_rollup where product_id = $1 and branch_id = $2;`,
      [rollupProductId, branchId]
    );
    expect(rollup.rows[0].quantity).toBe(ledgerSum);

    const view = await db.query<{ quantity: number }>(
      `select quantity from inventory_stock where product_id = $1 and branch_id = $2;`,
      [rollupProductId, branchId]
    );
    expect(view.rows[0].quantity).toBe(ledgerSum);
  });
});
