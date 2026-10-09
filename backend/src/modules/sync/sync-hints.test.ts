import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const supabaseAdmin = vi.hoisted(() => vi.fn());
vi.mock("../../shared/supabase/client.js", () => ({ supabaseAdmin }));

import { buildCommittedSaleEvent, publishCommittedSaleEvents, publishSyncHints, queueSyncHints } from "./sync-hints.js";

function fakeDatabase(branches: string[]) {
  const sent: Array<{ topic: string; event: string; payload: Record<string, unknown> }> = [];
  const channels = new Map<string, { httpSend: ReturnType<typeof vi.fn> }>();
  const query: Record<string, unknown> & { then?: (resolve: (value: unknown) => unknown) => unknown } = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.then = (resolve) => resolve({ data: branches.map((id) => ({ id })), error: null });
  const db = {
    from: vi.fn(() => query),
    channel: vi.fn((topic: string) => {
      const channel = { httpSend: vi.fn(async (event: string, payload: Record<string, unknown>) => {
        sent.push({ topic, event, payload });
        return { success: true as const };
      }) };
      channels.set(topic, channel);
      return channel;
    }),
    removeChannel: vi.fn(async () => "ok"),
  } as unknown as SupabaseClient;
  return { db, sent, channels };
}

describe("publishSyncHints", () => {
  it("publishes only a thin business and requested branch hint", async () => {
    const { db, sent } = fakeDatabase(["branch-a", "branch-b"]);

    await publishSyncHints(db, "business-a", ["branch-a"]);

    expect(sent.map((message) => message.topic).sort()).toEqual([
      "sync:business:business-a",
      "sync:business:business-a:branch:branch-a",
    ]);
    expect(sent.every((message) => message.event === "sync_hint" && message.payload.type === "sync_hint" && message.payload.scope === message.topic)).toBe(true);
    expect(sent.every((message) => !("records" in message.payload))).toBe(true);
  });

  it("fans a business-wide hint out to active branch scopes for workers", async () => {
    const { db, sent } = fakeDatabase(["branch-a", "branch-b"]);

    await publishSyncHints(db, "business-a", [null]);

    expect(sent.map((message) => message.topic).sort()).toEqual([
      "sync:business:business-a",
      "sync:business:business-a:branch:branch-a",
      "sync:business:business-a:branch:branch-b",
    ]);
  });

  it("does not finish the queued publication before Realtime accepts the hint", async () => {
    let release!: (value: { success: true }) => void;
    const send = vi.fn(() => new Promise<{ success: true }>((resolve) => {
      release = resolve;
    }));
    const db = {
      channel: vi.fn(() => ({ httpSend: send })),
      removeChannel: vi.fn(async () => "ok"),
    } as unknown as SupabaseClient;
    supabaseAdmin.mockReturnValue(db);

    let finished = false;
    const publication = queueSyncHints("business-a", []).then(() => {
      finished = true;
    });

    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(finished).toBe(false);

    release({ success: true });
    await publication;
    expect(finished).toBe(true);
    expect(db.removeChannel).toHaveBeenCalledOnce();
  });
});

describe("buildCommittedSaleEvent", () => {
  const sale = {
    id: "sale-a",
    client_id: "sale-client-a",
    business_id: "business-a",
    branch_id: "branch-a",
    customer_id: null,
    subtotal: 100,
    discount: 0,
    total: 100,
    created_at_local: "2026-10-09T10:00:00.000Z",
    created_at: "2026-10-09T10:00:01.000Z",
    created_by_user_id: "worker-a",
    voided_at: null,
  };
  const items = [{
    sale_id: "sale-a",
    product_id: "product-a",
    quantity: 2,
    unit_price: 50,
    discount: 0,
    unit_label: "unit",
    unit_conversion_factor: 1,
    unit_cost: 20,
    cost_basis: "moving_weighted_average",
    product_version: 3,
    cost_flags: [],
  }];
  const payments = [{ sale_id: "sale-a", method: "cash", amount: 100, tendered_amount: 100 }];
  const stock = [{
    id: "movement-a",
    client_id: "movement-client-a",
    business_id: "business-a",
    branch_id: "branch-a",
    product_id: "product-a",
    quantity_delta: -2,
    source: "sale",
    source_reference_id: "sale-a",
    reason_code: null,
    created_at_local: "2026-10-09T10:00:00.000Z",
    created_at: "2026-10-09T10:00:01.000Z",
    created_by_user_id: "worker-a",
  }];

  it("builds a completed event from authoritative committed rows", () => {
    const event = buildCommittedSaleEvent("business-a", "sync:business:business-a", sale, items, payments, stock, []);

    expect(event).toMatchObject({
      type: "sale_committed",
      status: "completed",
      sale: {
        id: "sale-a",
        total: 100,
        items: [{ productId: "product-a", quantity: 2, unitCost: 20 }],
        payments: [{ method: "cash", amount: 100 }],
        stockMovements: [{ id: "movement-a", quantityDelta: -2 }],
      },
    });
  });

  it("refuses incomplete or voided records", () => {
    expect(buildCommittedSaleEvent("business-a", "scope", sale, [], payments, stock, [])).toBeNull();
    expect(buildCommittedSaleEvent("business-a", "scope", { ...sale, voided_at: "2026-10-09T11:00:00.000Z" }, items, payments, stock, [])).toBeNull();
    expect(buildCommittedSaleEvent("business-a", "scope", sale, items, payments, [], [])).toBeNull();
  });
});

describe("publishCommittedSaleEvents", () => {
  it("publishes only a complete authoritative sale event", async () => {
    const sent: Array<{ event: string; payload: Record<string, unknown> }> = [];
    const rows: Record<string, unknown[]> = {
      sales: [{
        id: "sale-a", client_id: "sale-client-a", branch_id: "branch-a", customer_id: null,
        subtotal: 100, discount: 0, total: 100, created_at_local: "2026-10-09T10:00:00.000Z",
        created_at: "2026-10-09T10:00:01.000Z", created_by_user_id: "worker-a", voided_at: null,
      }],
      sale_items: [{
        sale_id: "sale-a", product_id: "product-a", quantity: 2, unit_price: 50, discount: 0,
        unit_label: "unit", unit_conversion_factor: 1, unit_cost: 20, cost_basis: "snapshot",
        product_version: 1, cost_flags: [],
      }],
      sale_payments: [{ sale_id: "sale-a", method: "cash", amount: 100 }],
      stock_movements: [{
        id: "movement-a", client_id: "movement-client-a", business_id: "business-a", branch_id: "branch-a",
        product_id: "product-a", quantity_delta: -2, source: "sale", source_reference_id: "sale-a",
        reason_code: null, created_at_local: "2026-10-09T10:00:00.000Z",
        created_at: "2026-10-09T10:00:01.000Z", created_by_user_id: "worker-a",
      }],
      customer_credit_movements: [],
    };
    const db = {
      from: vi.fn((table: string) => {
        const result = { data: rows[table] ?? [], error: null };
        const query: Record<string, unknown> & { then: (resolve: (value: unknown) => unknown) => unknown } = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          in: vi.fn(() => query),
          then: (resolve) => resolve(result),
        };
        return query;
      }),
      channel: vi.fn(() => ({
        httpSend: vi.fn(async (event: string, payload: Record<string, unknown>) => {
          sent.push({ event, payload });
          return { success: true as const };
        }),
      })),
      removeChannel: vi.fn(async () => "ok"),
    } as unknown as SupabaseClient;

    await publishCommittedSaleEvents(db, "business-a", ["sale-a"]);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.event).toBe("sale_committed");
    expect(sent[0]?.payload).toMatchObject({
      type: "sale_committed",
      status: "completed",
      businessId: "business-a",
      sale: { id: "sale-a", total: 100, stockMovements: [{ id: "movement-a" }] },
    });
  });
});
