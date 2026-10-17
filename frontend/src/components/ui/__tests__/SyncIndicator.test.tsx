// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SyncIndicator } from "../SyncIndicator";
import { TECHNICAL_LEAK_WORDS } from "@/features/sync/statusMessages";

const mockState = vi.hoisted(() => ({
  online: true,
  pendingCount: 0,
  failedCount: 0,
  runtimePhase: "idle" as "idle" | "uploading" | "downloading" | "syncing",
  pullFailure: false,
  pullComplete: true,
  safetyRequired: false,
  queueCount: 0,
  accountType: "WORKER" as "WORKER" | "BUSINESS_OWNER",
  showToast: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("@/lib/use-online-status", () => ({
  useOnlineStatus: () => mockState.online,
}));

vi.mock("@/lib/use-pending-sync-count", () => ({
  usePendingSyncCount: () => mockState.pendingCount,
  useFailedSyncCount: () => mockState.failedCount,
}));

vi.mock("@/features/sync/sync-runtime-state", () => ({
  useSyncRuntimePhase: () => mockState.runtimePhase,
  setSyncRuntimePhase: vi.fn(),
}));

vi.mock("@/features/auth/use-current-user", () => ({
  useCurrentUserOptional: () => ({ accountType: mockState.accountType }),
}));

vi.mock("@/lib/use-sync-safety", () => ({
  useSyncSafety: () => ({
    required: mockState.safetyRequired,
    queueCount: mockState.queueCount,
    oldestPendingAt: null,
    ageMs: 0,
  }),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast: mockState.showToast }),
}));

vi.mock("dexie-react-hooks", () => ({
  useLiveQuery: (fn: any, deps: any, initial: any) => {
    // If it's diagnosing pull failure
    if (initial && Array.isArray(initial)) {
      return mockState.pullFailure ? [{ entity: "products", success: false }] : [];
    }
    // Pull state
    return {
      lastCompletePullAt: new Date().toISOString(),
      lastServerContactAt: new Date().toISOString(),
    };
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    syncDiagnostics: {
      where: () => ({ equals: () => ({ toArray: () => Promise.resolve([]) }) }),
    },
    syncPullState: {
      get: () => Promise.resolve({ lastCompletePullAt: new Date().toISOString(), lastServerContactAt: new Date().toISOString() }),
    },
    outbox: {
      toArray: () => Promise.resolve([]),
      where: () => ({ equals: () => ({ first: () => Promise.resolve(null) }) }),
    },
  },
}));

vi.mock("@/lib/local-tenant", () => ({
  getLocalBusinessId: () => Promise.resolve("biz-1"),
}));

vi.mock("@/features/sync/drain-outbox", () => ({
  retryFailedOutboxItems: vi.fn(),
}));

vi.mock("@/features/sync/SyncEngine", () => ({
  runSyncCycle: vi.fn().mockResolvedValue({
    pushResult: { drained: 0, pendingRemaining: 0 },
    pullResult: { fullySynced: false, pulls: [] },
  }),
}));

describe("SyncIndicator - Zero-Jargon & Ambient Demotion Verification", () => {
  beforeEach(() => {
    mockState.online = true;
    mockState.pendingCount = 0;
    mockState.failedCount = 0;
    mockState.runtimePhase = "idle";
    mockState.pullFailure = false;
    mockState.pullComplete = true;
    mockState.safetyRequired = false;
    mockState.queueCount = 0;
    mockState.accountType = "WORKER";
    mockState.showToast.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("Permutation 1: Offline with pending items renders plain language and cashier safety guarantee", () => {
    mockState.online = false;
    mockState.pendingCount = 3;

    render(<SyncIndicator compact={false} />);

    expect(screen.getByText("Offline · Saved")).toBeInTheDocument();
  });

  it("Permutation 2: Demotes ambient catalog fetch failure on active header/POS checkout (no amber warning badge)", () => {
    // When 0 pending sales, but a background catalog pull dropped:
    mockState.online = true;
    mockState.pendingCount = 0;
    mockState.failedCount = 0;
    mockState.pullFailure = true;

    const { container } = render(<SyncIndicator compact variant="contrast" />);

    // Must NOT render warning badge or text
    expect(screen.queryByText(/needs attention/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sync issue/i)).not.toBeInTheDocument();

    // Renders calm, non-disruptive save indicator
    const button = screen.getByRole("status");
    expect(button).toBeInTheDocument();
    expect(button.getAttribute("title")).toContain("All saved");
  });

  it("Permutation 3: Expanded ambient catalog failure renders 'All saved' and 'Save now' without warning tone", () => {
    mockState.online = true;
    mockState.pendingCount = 0;
    mockState.failedCount = 0;
    mockState.pullFailure = true;

    render(<SyncIndicator compact={false} />);

    expect(screen.getByText("All saved")).toBeInTheDocument();
    expect(screen.getByText("Save now")).toBeInTheDocument();
    expect(screen.queryByText(/needs attention/i)).not.toBeInTheDocument();
  });

  it("Permutation 4: Replaces technical 'Sync now' button copy with 'Save now'", () => {
    mockState.online = true;
    mockState.pendingCount = 2;

    render(<SyncIndicator compact={false} />);

    expect(screen.getByText("Save now")).toBeInTheDocument();
    expect(screen.queryByText("Sync now")).not.toBeInTheDocument();
  });

  it("Permutation 5: Failed outbox entries show review label instead of engineering jargon", () => {
    mockState.online = true;
    mockState.failedCount = 2;

    render(<SyncIndicator compact={false} />);

    expect(screen.getByText("2 to review")).toBeInTheDocument();
    expect(screen.getByText("Save now")).toBeInTheDocument();
    expect(screen.queryByText(/sync now/i)).not.toBeInTheDocument();
  });

  it("Permutation 6: Safety backpressure renders 'Save required' instead of internal error strings", () => {
    mockState.online = true;
    mockState.safetyRequired = true;
    mockState.queueCount = 105;

    render(<SyncIndicator compact={false} />);

    expect(screen.getByText("Save required")).toBeInTheDocument();
    expect(screen.queryByText(/SYNC_REQUIRED/)).not.toBeInTheDocument();
  });

  it("Automated Prohibited Words Check: Zero technical leak words in rendered output across states", () => {
    const scenarios = [
      { online: true, pendingCount: 0, failedCount: 0, pullFailure: false },
      { online: true, pendingCount: 4, failedCount: 0, pullFailure: false },
      { online: false, pendingCount: 2, failedCount: 0, pullFailure: false },
      { online: true, pendingCount: 0, failedCount: 0, pullFailure: true },
      { online: true, pendingCount: 0, failedCount: 2, pullFailure: false },
      { online: true, pendingCount: 0, failedCount: 0, safetyRequired: true, queueCount: 110 },
    ];

    for (const scenario of scenarios) {
      cleanup();
      mockState.online = scenario.online;
      mockState.pendingCount = scenario.pendingCount;
      mockState.failedCount = scenario.failedCount;
      mockState.pullFailure = Boolean(scenario.pullFailure);
      mockState.safetyRequired = Boolean(scenario.safetyRequired);
      mockState.queueCount = scenario.queueCount ?? 0;

      const { container } = render(<SyncIndicator compact={false} />);
      const text = container.textContent || "";
      const html = container.innerHTML || "";

      // Ensure no forbidden technical words appear in rendered DOM text
      for (const word of TECHNICAL_LEAK_WORDS) {
        const wordRegex = new RegExp(`\\b${word}\\b`, "i");
        expect(wordRegex.test(text), `Rendered text contains prohibited word "${word}": "${text}"`).toBe(false);
      }

      // Check tooltips/titles/aria labels in HTML
      expect(html).not.toMatch(/title="[^"]*\b(sync|cloud|refresh|outbox|drain|stream)\b/i);
      expect(html).not.toMatch(/aria-label="[^"]*\b(sync|cloud|refresh|outbox|drain|stream)\b/i);
    }
  });
});
