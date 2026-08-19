import { describe, expect, it, vi } from "vitest";
import { adjustStock } from "../inventory/inventory.service.js";
import { executeAdminOperation } from "../admin/admin.service.js";
import { voidSale } from "../sales/void-sale.service.js";

const actor = { id: "user-1" } as never;

function dbFor(context: Record<string, unknown>, rpcResult: unknown = { ok: true }) {
  const rpc = vi.fn(async () => ({ data: rpcResult, error: null }));
  return { rpc, from: vi.fn() , __rpc: rpc, __context: context } as never;
}

function contextFor(account_type: string, overrides: Record<string, unknown> = {}) {
  return {
    user_id: "user-1",
    account_type,
    business_id: account_type === "ADMIN" ? null : "business-a",
    business_status: account_type === "ADMIN" ? null : "verified",
    membership_status: account_type === "ADMIN" ? null : "active",
    branch_ids: account_type === "WORKER" ? ["branch-a"] : [],
    ...overrides,
  };
}

function withResolver(db: any) {
  const original = db.rpc;
  db.rpc = vi.fn((name: string, args?: unknown) => {
    if (name === "resolve_account_context") return { maybeSingle: async () => ({ data: db.__context, error: null }) };
    return original(name, args);
  });
  return db;
}

describe("backend authorization integration", () => {
  it("allows a Worker only on an assigned branch", async () => {
    const db: any = withResolver(dbFor(contextFor("WORKER")));
    await expect(adjustStock(db, actor, { id: "movement-1", branchId: "branch-a", productId: "product-a", quantityDelta: 1 })).resolves.toEqual({ ok: true });
    await expect(adjustStock(db, actor, { id: "movement-2", branchId: "branch-b", productId: "product-a", quantityDelta: 1 })).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  it("rejects suspended businesses and disabled Workers before domain RPCs", async () => {
    const suspended: any = withResolver(dbFor(contextFor("BUSINESS_OWNER", { business_status: "suspended" })));
    await expect(adjustStock(suspended, actor, { id: "movement-1", branchId: "branch-a", productId: "product-a", quantityDelta: 1 })).rejects.toMatchObject({ status: 403 });
    const disabled: any = withResolver(dbFor(contextFor("WORKER", { membership_status: "disabled" })));
    await expect(adjustStock(disabled, actor, { id: "movement-1", branchId: "branch-a", productId: "product-a", quantityDelta: 1 })).rejects.toMatchObject({ status: 403 });
  });

  it("allows Admin without a tenant and rejects Owner from Admin operations", async () => {
    const admin: any = withResolver(dbFor(contextFor("ADMIN")));
    admin.from = vi.fn((table: string) => table === "business_profile"
      ? { select: () => ({ order: async () => ({ data: [], error: null }) }) }
      : { select: () => ({ eq: async () => ({ data: [], error: null }) }) });
    await expect(executeAdminOperation(admin, actor, { action: "list_businesses" })).resolves.toEqual({ businesses: [] });
    const owner: any = withResolver(dbFor(contextFor("BUSINESS_OWNER")));
    await expect(executeAdminOperation(owner, actor, { action: "list_businesses" })).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  it("allows only the Business Owner to void a sale", async () => {
    const owner: any = withResolver(dbFor(contextFor("BUSINESS_OWNER")));
    await expect(voidSale(owner, actor, { saleId: "sale-a", reason: "Correction" })).resolves.toMatchObject({ status: "ok" });
    const worker: any = withResolver(dbFor(contextFor("WORKER")));
    await expect(voidSale(worker, actor, { saleId: "sale-a", reason: "Correction" })).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });
});
