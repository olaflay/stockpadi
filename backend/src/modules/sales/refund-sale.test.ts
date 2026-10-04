import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { parseRefundSaleRequest } from "./refund-sale.schema.js";
import { refundSale } from "./refund-sale.service.js";

describe("parseRefundSaleRequest", () => {
  it("rejects non-object or missing saleId", () => {
    expect(() => parseRefundSaleRequest(null)).toThrow("Request body must be an object");
    expect(() => parseRefundSaleRequest({})).toThrow("saleId is required");
    expect(() => parseRefundSaleRequest({ saleId: "  " })).toThrow("saleId is required");
  });

  it("rejects empty reason", () => {
    expect(() =>
      parseRefundSaleRequest({
        saleId: "sale-1",
        reason: "   ",
        items: [{ productId: "prod-1", quantity: 1, unitPrice: 100 }],
        payments: [{ method: "cash", amount: 100 }],
      })
    ).toThrow("reason is required and cannot be empty");
  });

  it("rejects empty items array or invalid item quantity", () => {
    expect(() =>
      parseRefundSaleRequest({
        saleId: "sale-1",
        reason: "defective",
        items: [],
        payments: [{ method: "cash", amount: 100 }],
      })
    ).toThrow("items array is required");

    expect(() =>
      parseRefundSaleRequest({
        saleId: "sale-1",
        reason: "defective",
        items: [{ productId: "prod-1", quantity: -1, unitPrice: 100 }],
        payments: [{ method: "cash", amount: 100 }],
      })
    ).toThrow("quantity must be a positive integer");
  });

  it("rejects invalid payment methods or amounts", () => {
    expect(() =>
      parseRefundSaleRequest({
        saleId: "sale-1",
        reason: "defective",
        items: [{ productId: "prod-1", quantity: 1, unitPrice: 100 }],
        payments: [{ method: "bitcoin", amount: 100 }],
      })
    ).toThrow("Invalid payment method");

    expect(() =>
      parseRefundSaleRequest({
        saleId: "sale-1",
        reason: "defective",
        items: [{ productId: "prod-1", quantity: 1, unitPrice: 100 }],
        payments: [{ method: "cash", amount: 0 }],
      })
    ).toThrow("Payment amount must be a positive number");
  });

  it("parses valid refund request correctly", () => {
    const parsed = parseRefundSaleRequest({
      saleId: "sale-123",
      reason: "Customer returned spoiled goods",
      items: [{ productId: "p-1", quantity: 2, unitPrice: 1500 }],
      payments: [{ method: "cash", amount: 3000 }],
    });

    expect(parsed).toEqual({
      saleId: "sale-123",
      reason: "Customer returned spoiled goods",
      items: [{ productId: "p-1", quantity: 2, unitPrice: 1500 }],
      payments: [{ method: "cash", amount: 3000 }],
    });
  });
});

describe("refundSale service", () => {
  it("rejects non-owner callers", async () => {
    const mockDb = {
      rpc: vi.fn().mockImplementation((fn: string) => {
        if (fn === "resolve_account_context") {
          return {
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                user_id: "worker-1",
                account_type: "WORKER",
                business_id: "biz-1",
                membership_status: "active",
                business_status: "verified",
                branch_ids: ["branch-1"],
              },
              error: null,
            }),
          };
        }
        return Promise.resolve({ data: null, error: null });
      }),
    } as unknown as SupabaseClient;

    const actor = { id: "worker-1" } as User;

    await expect(
      refundSale(mockDb, actor, {
        saleId: "sale-1",
        reason: "Return",
        items: [{ productId: "p-1", quantity: 1, unitPrice: 1000 }],
        payments: [{ method: "cash", amount: 1000 }],
      })
    ).rejects.toThrow("Only an owner or admin may refund a sale");
  });

  it("delegates to refund_sale RPC and returns result for business owner", async () => {
    const mockDb = {
      rpc: vi.fn().mockImplementation((fn: string) => {
        if (fn === "resolve_account_context") {
          return {
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                user_id: "owner-1",
                account_type: "BUSINESS_OWNER",
                business_id: "biz-1",
                membership_status: "active",
                business_status: "verified",
                branch_ids: null,
              },
              error: null,
            }),
          };
        }
        if (fn === "refund_sale") {
          return Promise.resolve({
            data: {
              status: "ok",
              refundId: "ref-123",
              totalRefunded: 2000,
              restoredStock: 2,
            },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    } as unknown as SupabaseClient;

    const actor = { id: "owner-1" } as User;

    const result = await refundSale(mockDb, actor, {
      saleId: "sale-1",
      reason: "Customer dissatisfaction",
      items: [{ productId: "p-1", quantity: 2, unitPrice: 1000 }],
      payments: [{ method: "cash", amount: 2000 }],
    });

    expect(result).toEqual({
      status: "ok",
      refundId: "ref-123",
      totalRefunded: 2000,
      restoredStock: 2,
    });
  });
});
