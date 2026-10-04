import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { parseCustomer, parseCreditPayment } from "./customer.schema.js";
import { createCustomer, listCustomers, getCustomerDetail } from "./customer.service.js";

// Mock supabaseAdmin
vi.mock("../../shared/supabase/client.js", () => ({
  supabaseAdmin: () => ({
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
              branch_ids: ["branch-1"],
            },
            error: null,
          }),
        };
      }
      return Promise.resolve({ data: null, error: null });
    }),
  }),
}));

describe("customer.schema", () => {
  it("parses valid customer with phone trimming", () => {
    const result = parseCustomer({
      id: "cust-1",
      name: "  Amaka Eze  ",
      phone: " 08033334444 ",
    });

    expect(result.id).toBe("cust-1");
    expect(result.name).toBe("Amaka Eze");
    expect(result.phone).toBe("08033334444");
    expect(result.updatedAt).toBeDefined();
  });

  it("rejects missing id or name", () => {
    expect(() => parseCustomer(null)).toThrow("Request body must be an object");
    expect(() => parseCustomer({ id: "cust-1", name: "   " })).toThrow("Customer id and name are required");
    expect(() => parseCustomer({ name: "Valid" })).toThrow("Customer id and name are required");
  });

  it("parses valid credit payment", () => {
    const payment = parseCreditPayment({
      id: "pay-1",
      customerId: "cust-1",
      amount: 5000,
      note: "Partial repayment",
    });

    expect(payment.id).toBe("pay-1");
    expect(payment.customerId).toBe("cust-1");
    expect(payment.amount).toBe(5000);
    expect(payment.note).toBe("Partial repayment");
  });
});

describe("customer.service", () => {
  const actor = { id: "owner-1" } as User;

  it("createCustomer invokes sync_apply_customer RPC", async () => {
    const mockDb = {
      rpc: vi.fn().mockImplementation((fn: string, params: Record<string, unknown>) => {
        if (fn === "sync_apply_customer") {
          return Promise.resolve({ data: { success: true, id: (params.payload as { id: string }).id }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    } as unknown as SupabaseClient;

    const result = await createCustomer(mockDb, actor, {
      id: "cust-123",
      name: "Chinedu Okeke",
      phone: "08011223344",
    });

    expect(result).toEqual({ success: true, id: "cust-123" });
    expect(mockDb.rpc).toHaveBeenCalledWith("sync_apply_customer", {
      payload: expect.objectContaining({ id: "cust-123", name: "Chinedu Okeke" }),
      actor_id: "owner-1",
    });
  });

  it("listCustomers loads customers and joins credit balances", async () => {
    const mockCustomers = [
      { id: "c-1", name: "Alice", phone: null, updated_at: "2026-10-01" },
      { id: "c-2", name: "Bob", phone: "123", updated_at: "2026-10-01" },
    ];
    const mockBalances = [
      { customer_id: "c-1", balance: 4500 },
    ];

    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "customers") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: mockCustomers, error: null }),
              }),
            }),
          };
        }
        if (table === "customer_credit_balances") {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: mockBalances, error: null }),
            }),
          };
        }
        return {};
      }),
    } as unknown as SupabaseClient;

    const result = await listCustomers(mockDb, actor);

    expect(result.customers).toHaveLength(2);
    expect(result.customers[0]).toEqual({
      id: "c-1",
      name: "Alice",
      phone: null,
      updated_at: "2026-10-01",
      balance: 4500,
    });
    expect(result.customers[1].balance).toBe(0);
  });

  it("getCustomerDetail loads customer, movements, and sales", async () => {
    const mockCustomer = { id: "c-1", name: "Alice", phone: null, updated_at: "2026-10-01" };
    const mockMovements = [{ id: "m-1", amount_delta: -2000 }];
    const mockSales = [{ id: "s-1", total: 2000 }];

    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "customers") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: mockCustomer, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === "customer_credit_movements") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: mockMovements, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === "sales") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: mockSales, error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      }),
    } as unknown as SupabaseClient;

    const result = await getCustomerDetail(mockDb, actor, "c-1");

    expect(result.customer).toEqual(mockCustomer);
    expect(result.creditMovements).toEqual(mockMovements);
    expect(result.sales).toEqual(mockSales);
  });

  it("getCustomerDetail throws 404 when customer does not exist", async () => {
    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "customers") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          };
        }
        return {};
      }),
    } as unknown as SupabaseClient;

    await expect(getCustomerDetail(mockDb, actor, "non-existent")).rejects.toThrow("Customer not found");
  });
});
