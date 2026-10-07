import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { parseRefundSaleRequest } from "./refund-sale.schema.js";
import { refundSale } from "./refund-sale.service.js";

const CLIENT_REFUND_ID = "11111111-1111-4111-8111-111111111111";

describe("parseRefundSaleRequest", () => {
  it("requires a stable refund intent id", () => {
    expect(() => parseRefundSaleRequest({ saleId: "sale-1" })).toThrow("clientRefundId");
  });

  it("rejects empty reason and invalid quantity", () => {
    const base = { clientRefundId: CLIENT_REFUND_ID, saleId: "sale-1", payments: [{ method: "cash", amount: 100 }] };
    expect(() => parseRefundSaleRequest({ ...base, reason: "   ", items: [{ productId: "p-1", quantity: 1 }] })).toThrow("reason is required");
    expect(() => parseRefundSaleRequest({ ...base, reason: "defective", items: [{ productId: "p-1", quantity: -1 }] })).toThrow("quantity must be a positive integer");
  });

  it("rejects client-provided unit prices", () => {
    expect(() => parseRefundSaleRequest({
      clientRefundId: CLIENT_REFUND_ID,
      saleId: "sale-1",
      reason: "defective",
      items: [{ productId: "p-1", quantity: 1, unitPrice: 1_000 }],
      payments: [{ method: "cash", amount: 1000 }],
    })).toThrow("must not be supplied");
  });

  it("parses a valid intent without financial truth from the client", () => {
    expect(parseRefundSaleRequest({
      clientRefundId: CLIENT_REFUND_ID,
      saleId: "sale-123",
      reason: "Customer returned spoiled goods",
      items: [{ productId: "p-1", quantity: 2 }],
      payments: [{ method: "cash", amount: 3000 }],
    })).toEqual({
      clientRefundId: CLIENT_REFUND_ID,
      saleId: "sale-123",
      reason: "Customer returned spoiled goods",
      items: [{ productId: "p-1", quantity: 2 }],
      payments: [{ method: "cash", amount: 3000 }],
    });
  });
});

describe("refundSale service", () => {
  function mockDb(rpcResult: unknown = { data: null, error: null }) {
    return {
      rpc: vi.fn().mockImplementation((fn: string) => {
        if (fn === "resolve_account_context") return {
          maybeSingle: vi.fn().mockResolvedValue({
            data: { user_id: "owner-1", account_type: "BUSINESS_OWNER", business_id: "biz-1", membership_status: "active", business_status: "verified", branch_ids: null },
            error: null,
          }),
        };
        return Promise.resolve(rpcResult);
      }),
    } as unknown as SupabaseClient;
  }

  it("rejects non-owner callers", async () => {
    const mockDb = {
      rpc: vi.fn().mockImplementation((fn: string) => fn === "resolve_account_context" ? {
        maybeSingle: vi.fn().mockResolvedValue({ data: { user_id: "worker-1", account_type: "WORKER", business_id: "biz-1", membership_status: "active", business_status: "verified", branch_ids: ["branch-1"] }, error: null }),
      } : Promise.resolve({ data: null, error: null })),
    } as unknown as SupabaseClient;
    await expect(refundSale(mockDb, { id: "worker-1" } as User, {
      clientRefundId: CLIENT_REFUND_ID, saleId: "sale-1", reason: "Return", items: [{ productId: "p-1", quantity: 1 }], payments: [{ method: "cash", amount: 1000 }],
    })).rejects.toThrow("Only an owner or admin may refund a sale");
  });

  it("passes stable identity and intent-only items to the RPC", async () => {
    const db = mockDb({ data: { status: "ok", refundId: CLIENT_REFUND_ID, totalRefunded: 2000, restoredStock: 2, items: [], payments: [] }, error: null });
    const result = await refundSale(db, { id: "owner-1" } as User, {
      clientRefundId: CLIENT_REFUND_ID, saleId: "sale-1", reason: "Customer dissatisfaction", items: [{ productId: "p-1", quantity: 2 }], payments: [{ method: "cash", amount: 2000 }],
    });
    expect(result).toMatchObject({ status: "ok", refundId: CLIENT_REFUND_ID, totalRefunded: 2000, restoredStock: 2 });
    expect((db.rpc as ReturnType<typeof vi.fn>).mock.calls[1]).toEqual(["refund_sale", expect.objectContaining({ p_client_refund_id: CLIENT_REFUND_ID, p_items: [{ product_id: "p-1", quantity: 2 }] })]);
  });
});
