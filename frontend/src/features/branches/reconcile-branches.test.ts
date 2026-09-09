import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    auth: { getSession },
    from: fromMock,
  }),
}));

interface MockBranch {
  id: string;
  name: string;
  isActive?: boolean;
  businessId: string;
}

interface MockOutbox {
  clientId: string;
  status: string;
  payload: { branchId: string; qty?: number };
  businessId: string;
}

interface MockMovement {
  id: string;
  branchId: string;
  businessId: string;
}

const branchesMap = new Map<string, MockBranch>();
const outboxMap = new Map<string, MockOutbox>();
const stockMovementsMap = new Map<string, MockMovement>();

vi.mock("@/lib/db", () => ({
  db: {
    branches: {
      put: vi.fn((b) => {
        branchesMap.set(b.id, b);
        return Promise.resolve();
      }),
      delete: vi.fn((id) => {
        branchesMap.delete(id);
        return Promise.resolve();
      }),
    },
    outbox: {
      toArray: vi.fn(() => Promise.resolve(Array.from(outboxMap.values()))),
      update: vi.fn((id, changes) => {
        const item = outboxMap.get(id);
        if (item) Object.assign(item, changes);
        return Promise.resolve();
      }),
    },
    stockMovements: {
      toArray: vi.fn(() => Promise.resolve(Array.from(stockMovementsMap.values()))),
      update: vi.fn((id, changes) => {
        const item = stockMovementsMap.get(id);
        if (item) Object.assign(item, changes);
        return Promise.resolve();
      }),
    },
  },
}));

vi.mock("@/lib/local-tenant", () => ({
  getLocalBusinessId: vi.fn(() => Promise.resolve("biz-100")),
  tenantArray: vi.fn(() => Promise.resolve(Array.from(branchesMap.values()))),
  matchesActiveTenant: vi.fn(() => true),
}));

import { reconcileLocalBranches } from "./reconcile-branches";

describe("reconcileLocalBranches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    branchesMap.clear();
    outboxMap.clear();
    stockMovementsMap.clear();
  });

  it("returns reconciled: false when there is no auth session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });

    const result = await reconcileLocalBranches();

    expect(result.reconciled).toBe(false);
  });

  it("reconciles stale local branch with remote branch and repairs outbox payload", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "token-1" } } });

    // Remote branch from Postgres
    const remoteBranch = {
      id: "srv-branch-999",
      name: "Main branch",
      is_active: true,
      business_id: "biz-100",
    };

    const selectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [remoteBranch], error: null }),
      }),
    });
    fromMock.mockReturnValue({ select: selectMock });

    // Local DB has a stale client UUID
    branchesMap.set("client-uuid-111", {
      id: "client-uuid-111",
      name: "Main branch",
      isActive: true,
      businessId: "biz-100",
    });

    // Outbox has an item referencing the stale branch
    outboxMap.set("outbox-1", {
      clientId: "outbox-1",
      status: "failed",
      payload: { branchId: "client-uuid-111", qty: 10 },
      businessId: "biz-100",
    });

    // Stock movements referencing the stale branch
    stockMovementsMap.set("movement-1", {
      id: "movement-1",
      branchId: "client-uuid-111",
      businessId: "biz-100",
    });

    const result = await reconcileLocalBranches();

    expect(result.reconciled).toBe(true);
    expect(result.remoteCount).toBe(1);
    expect(result.repairedOutboxCount).toBe(1);

    // Stale branch removed, server branch present
    expect(branchesMap.has("client-uuid-111")).toBe(false);
    expect(branchesMap.get("srv-branch-999")?.name).toBe("Main branch");

    // Outbox repaired to point to server branch
    expect(outboxMap.get("outbox-1")?.payload.branchId).toBe("srv-branch-999");
    expect(outboxMap.get("outbox-1")?.status).toBe("pending");

    // Movement repaired to point to server branch
    expect(stockMovementsMap.get("movement-1")?.branchId).toBe("srv-branch-999");
  });
});
