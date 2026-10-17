// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SyncHealthPage from "../page";
import {
  formatFriendlyTimestamp,
  resolveMerchantBackupStatus,
} from "../backup-status-utils";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/features/auth/use-current-user";
import type { SyncQueueItem } from "@/types/sync";
import type { Product } from "@/types/product";

let currentUser: CurrentUser = {
  id: "user-owner-1",
  fullName: "Alhaji Bello",
  accountType: "BUSINESS_OWNER",
  businessId: "biz-1",
  businessStatus: "verified",
  branchIds: ["branch-1"],
};

let mockOnlineStatus = true;
let mockSafetyRequired = false;
let mockServerGetResult: {
  syncReadConfigured?: boolean;
  environment?: string;
  supabaseProjectRef?: string | null;
} = {
  syncReadConfigured: true,
  supabaseProjectRef: "test-ref",
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/settings/sync-health",
}));

vi.mock("@/features/auth/use-current-user", () => ({
  useCurrentUser: () => currentUser,
}));

vi.mock("@/lib/use-online-status", () => ({
  useOnlineStatus: () => mockOnlineStatus,
}));

vi.mock("@/lib/use-sync-safety", () => ({
  useSyncSafety: () => ({
    required: mockSafetyRequired,
    queueCount: 0,
    oldestPendingAt: null,
    ageMs: 0,
  }),
}));

vi.mock("@/platform/api/backend-client", () => ({
  serverGet: vi.fn().mockImplementation(() => Promise.resolve(mockServerGetResult)),
}));

const mockRunSyncCycle = vi.fn().mockResolvedValue({
  pullResult: { fullySynced: true },
});

vi.mock("@/features/sync/SyncEngine", () => ({
  runSyncCycle: () => mockRunSyncCycle(),
}));

const { mockDebugSnapshot } = vi.hoisted(() => ({
  mockDebugSnapshot: {
    coordinator: { phase: "idle", sessionId: "coordinator-session-uuid-999" },
    lastServerResponse: { status: "failed", errorCode: "PULL_BATCH_HTTP_500", httpStatus: 500 },
    oldestPending: { attemptCount: 3 },
    datasets: [{ name: "products_dataset", records: 42 }],
  },
}));

vi.mock("@/features/sync/sync-observability", () => ({
  getSyncDebugSnapshot: vi.fn().mockImplementation(() => Promise.resolve(mockDebugSnapshot)),
}));

vi.mock("@/components/ui/Ripple", () => ({
  RippleButton: ({
    children,
    onClick,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

// Strictly forbidden technical jargon in user-facing merchant DOM
const TECHNICAL_JARGON_REGEX = /\b(HTTP|PULL|PUSH|Coordinator|UUID|Dataset|ErrorCode)\b/i;

function assertNoTechnicalJargonInDOM(container: HTMLElement) {
  // Standard SVG namespace URI (http://www.w3.org/2000/svg) is an XML schema attribute, not user-facing DOM jargon
  const sanitizedHtml = container.innerHTML.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, "");
  expect(sanitizedHtml).not.toMatch(TECHNICAL_JARGON_REGEX);
  expect(container.textContent).not.toMatch(TECHNICAL_JARGON_REGEX);
}

describe("SyncHealthPage - Calm Merchant Safe Interface & Lexical Quarantine Gate", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF;
    mockOnlineStatus = true;
    mockSafetyRequired = false;
    mockServerGetResult = {
      syncReadConfigured: true,
      supabaseProjectRef: "test-ref",
    };
    currentUser = {
      id: "user-owner-1",
      fullName: "Alhaji Bello",
      accountType: "BUSINESS_OWNER",
      businessId: "biz-1",
      businessStatus: "verified",
      branchIds: ["branch-1"],
    };

    // Mock storage persistence API
    Object.assign(navigator, {
      storage: {
        persisted: vi.fn().mockResolvedValue(true),
        persist: vi.fn().mockResolvedValue(true),
      },
    });

    await db.outbox.clear();
    await db.syncPullState.clear();
    await db.syncDiagnostics.clear();
    await db.branches.clear();
    await db.products.clear();
    await db.inventoryStock.clear();
    await db.stockMovements.clear();
    await db.syncQuarantine.clear();

    await db.branches.put({
      id: "branch-1",
      businessId: "biz-1",
      name: "Main Branch",
      isActive: true,
      isPrimary: true,
    });
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF;
    cleanup();
  });

  describe("formatFriendlyTimestamp unit tests", () => {
    it("returns 'No cloud backup yet' for falsy values", () => {
      expect(formatFriendlyTimestamp(null)).toBe("No cloud backup yet");
      expect(formatFriendlyTimestamp(undefined)).toBe("No cloud backup yet");
      expect(formatFriendlyTimestamp("")).toBe("No cloud backup yet");
    });

    it("formats relative timestamps in friendly retail phrasing", () => {
      const now = Date.now();
      expect(formatFriendlyTimestamp(new Date(now - 15000).toISOString())).toBe("Just now");
      expect(formatFriendlyTimestamp(new Date(now - 2 * 60 * 1000).toISOString())).toBe(
        "Last saved 2 mins ago"
      );
      expect(formatFriendlyTimestamp(new Date(now - 60 * 60 * 1000).toISOString())).toBe(
        "Last saved 1 hour ago"
      );
    });
  });

  describe("resolveMerchantBackupStatus classification", () => {
    it("classifies offline as 'Working Offline' with device-safety and storage reassurance", () => {
      const result = resolveMerchantBackupStatus({
        online: false,
        awaitingApproval: false,
        cloud: "unknown",
        cloudError: null,
        safetyRequired: false,
        pullFailed: false,
        lastPullErrorCode: null,
        issuesCount: 0,
        pendingCount: 0,
        hasConflicts: false,
        lastSavedAt: new Date().toISOString(),
        isBusy: false,
        storagePersisted: true,
      });

      expect(result.category).toBe("offline");
      expect(result.headline).toBe("All changes saved safely on this device");
      expect(result.subtext).toContain("back up to the cloud automatically once your internet connection returns");
      expect(result.storageReassurance).toContain("Protected device storage active");
    });

    it("classifies healthy state as 'Everything backed up' with verified invariant", () => {
      const result = resolveMerchantBackupStatus({
        online: true,
        awaitingApproval: false,
        cloud: "connected",
        cloudError: null,
        safetyRequired: false,
        pullFailed: false,
        lastPullErrorCode: null,
        issuesCount: 0,
        pendingCount: 0,
        hasConflicts: false,
        lastSavedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
        isBusy: false,
        ledgerSumMatches: true,
      });

      expect(result.category).toBe("healthy");
      expect(result.headline).toBe("Everything backed up");
      expect(result.timestamp).toBe("Last saved 2 mins ago");
      expect(result.invariantReassurance).toBe("Stock counts and sales records match the cloud.");
    });

    it("classifies unauthenticated error into plain-language 'Sign in again' instruction", () => {
      const result = resolveMerchantBackupStatus({
        online: true,
        awaitingApproval: false,
        cloud: "failed",
        cloudError: "UNAUTHENTICATED",
        safetyRequired: false,
        pullFailed: true,
        lastPullErrorCode: "UNAUTHENTICATED",
        issuesCount: 0,
        pendingCount: 0,
        hasConflicts: false,
        lastSavedAt: null,
        isBusy: false,
      });

      expect(result.category).toBe("action_needed");
      expect(result.headline).toBe("Action needed");
      expect(result.subtext).toBe("Sign in again to continue backing up.");
    });

    it("classifies quarantined changes with calm non-blocking subtext", () => {
      const result = resolveMerchantBackupStatus({
        online: true,
        awaitingApproval: false,
        cloud: "connected",
        cloudError: null,
        safetyRequired: false,
        pullFailed: false,
        lastPullErrorCode: null,
        issuesCount: 1,
        pendingCount: 0,
        hasConflicts: false,
        lastSavedAt: new Date().toISOString(),
        isBusy: false,
        quarantinedCount: 1,
      });

      expect(result.category).toBe("action_needed");
      expect(result.headline).toBe("Action needed");
      expect(result.subtext).toBe("One change needs review. Your other sales and records are continuing to back up normally.");
    });
  });

  describe("Lexical DOM Crawl: 0 Forbidden Technical Tokens Across All Permutations", () => {
    it("Permutation 1: Healthy renders 'Everything backed up' and zero jargon", async () => {
      await db.syncPullState.put({
        id: "biz-1:session",
        businessId: "biz-1",
        cursor: "100",
        startedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
        completedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
        pagesFetched: 1,
        entityCounts: {},
        lastCompletePullAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
        lastSuccessfulPushAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
        lastPullStatus: "success",
        lastPushStatus: "success",
        partialErrors: [],
      });

      const { container } = render(<SyncHealthPage />);

      expect(await screen.findByText("Everything backed up")).toBeInTheDocument();
      expect(screen.getByText("Last saved 2 mins ago")).toBeInTheDocument();
      expect(screen.getByText("Stock counts and sales records match the cloud.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Check for Updates/i })).toBeInTheDocument();

      assertNoTechnicalJargonInDOM(container);
    });

    it("Permutation 2: Healthy with saving changes in flight", async () => {
      await db.outbox.put({
        clientId: "sale-in-flight-1",
        businessId: "biz-1",
        type: "sale",
        operation: "append",
        status: "pending",
        attemptCount: 0,
        lastError: null,
        createdAtLocal: new Date().toISOString(),
        payload: { id: "sale-1" },
      });

      const { container } = render(<SyncHealthPage />);

      expect(await screen.findByText("Saving to cloud")).toBeInTheDocument();
      expect(screen.getByText("All changes are saved safely on this device and are uploading to the cloud.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Back Up Now/i })).toBeInTheDocument();

      assertNoTechnicalJargonInDOM(container);
    });

    it("Permutation 3: Working Offline with storage persistence lease granted", async () => {
      mockOnlineStatus = false;

      const { container } = render(<SyncHealthPage />);

      expect(await screen.findByText("All changes saved safely on this device")).toBeInTheDocument();
      expect(screen.getByText("Working Offline")).toBeInTheDocument();
      expect(
        screen.getByText(/back up to the cloud automatically once your internet connection returns/i)
      ).toBeInTheDocument();
      expect(
        await screen.findByText(/Protected device storage active: all offline sales and stock entries are safeguarded/i)
      ).toBeInTheDocument();

      assertNoTechnicalJargonInDOM(container);
    });

    it("Permutation 4: Action Needed - UNAUTHENTICATED auth expiry", async () => {
      await db.syncPullState.put({
        id: "biz-1:session",
        businessId: "biz-1",
        cursor: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
        pagesFetched: 0,
        entityCounts: {},
        lastCompletePullAt: null,
        lastPullStatus: "failed",
        lastPullErrorCode: "UNAUTHENTICATED",
        lastPushStatus: "success",
        partialErrors: ["auth_failure"],
      });

      const { container } = render(<SyncHealthPage />);

      expect(await screen.findByText("Action needed")).toBeInTheDocument();
      expect(screen.getByText("Sign in again to continue backing up.")).toBeInTheDocument();

      assertNoTechnicalJargonInDOM(container);
      expect(container.innerHTML).not.toContain("UNAUTHENTICATED");
    });

    it("Permutation 5: Action Needed - PROJECT_MISMATCH project ref update", async () => {
      process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF = "frontend-project-id";
      mockServerGetResult = {
        syncReadConfigured: true,
        supabaseProjectRef: "different-backend-project-id",
      };

      const { container } = render(<SyncHealthPage />);

      expect(await screen.findByText("Action needed")).toBeInTheDocument();
      expect(
        await screen.findByText(/The app is connected to an updated store system. Refresh the page or contact support to continue backing up./i)
      ).toBeInTheDocument();

      assertNoTechnicalJargonInDOM(container);
      expect(container.innerHTML).not.toContain("PROJECT_MISMATCH");

      delete process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF;
    });

    it("Permutation 6: Action Needed - Awaiting store account approval", async () => {
      currentUser = {
        ...currentUser,
        businessStatus: "pending",
      };

      const { container } = render(<SyncHealthPage />);

      expect(await screen.findByText("Action needed")).toBeInTheDocument();
      expect(
        screen.getByText(/Your store account is being verified. All changes remain safely saved on this device and will back up once approved./i)
      ).toBeInTheDocument();

      assertNoTechnicalJargonInDOM(container);
    });

    it("Permutation 7: Action Needed - Quarantined poison pill item", async () => {
      await db.syncQuarantine.put({
        id: "quarantine:poison-pill-1",
        businessId: "biz-1",
        entity: "product",
        entityId: "prod-bad-1",
        record: { id: "prod-bad-1" },
        reason: "Poison pill failure quarantined",
        createdAt: new Date().toISOString(),
      });

      const { container } = render(<SyncHealthPage />);

      expect(await screen.findByText("Action needed")).toBeInTheDocument();
      expect(
        screen.getByText("One change needs review. Your other sales and records are continuing to back up normally.")
      ).toBeInTheDocument();

      assertNoTechnicalJargonInDOM(container);
    });

    it("Permutation 8: Action Needed - Catalog conflict with side-by-side reconciliation", async () => {
      const existingProduct: Product = {
        id: "prod-conflict-1",
        businessId: "biz-1",
        sku: "MILO-500",
        barcode: null,
        name: "Milo 500g",
        categoryId: null,
        brandId: null,
        unitLabel: "piece",
        altUnitLabel: null,
        altUnitConversionFactor: null,
        altUnitSellPrice: null,
        sellPrice: 2500,
        costPrice: 2000,
        expiryTracking: "off",
        expiryDate: null,
        lowStockThreshold: null,
        version: 5,
        updatedAt: new Date().toISOString(),
      };
      await db.products.put(existingProduct);

      const conflictItem: SyncQueueItem<Product> = {
        clientId: "client-mutation-1",
        businessId: "biz-1",
        type: "product",
        operation: "upsert",
        status: "conflict",
        attemptCount: 1,
        lastError: "Conflict occurred",
        createdAtLocal: new Date().toISOString(),
        entityId: "prod-conflict-1",
        payload: {
          ...existingProduct,
          sellPrice: 2800,
          costPrice: 2200,
          version: 4,
        },
      };
      await db.outbox.put(conflictItem);

      const { container } = render(<SyncHealthPage />);

      expect(await screen.findByText("Review Conflicting Changes")).toBeInTheDocument();
      expect(
        screen.getByText("This item was edited on another device. Which price do you want to keep?")
      ).toBeInTheDocument();

      expect(screen.getByText("This Device")).toBeInTheDocument();
      expect(screen.getByText("Other Device")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Keep This Device" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Keep Other Device" })).toBeInTheDocument();

      assertNoTechnicalJargonInDOM(container);
      expect(container.innerHTML).not.toContain("expectedVersion");
      expect(container.innerHTML).not.toContain("client-mutation-1");
    });

    it("Permutation 9: Protected financial record conflict notice", async () => {
      const conflictSaleItem: SyncQueueItem = {
        clientId: "client-sale-conflict",
        businessId: "biz-1",
        type: "sale",
        operation: "append",
        status: "conflict",
        attemptCount: 1,
        lastError: "Conflict occurred",
        createdAtLocal: new Date().toISOString(),
        entityId: "sale-1",
        payload: { id: "sale-1", total: 5000 },
      };
      await db.outbox.put(conflictSaleItem);

      const { container } = render(<SyncHealthPage />);

      expect(await screen.findByText("Review Conflicting Changes")).toBeInTheDocument();
      expect(
        screen.getByText(/Sales and money records are protected to preserve accurate accounts. This record cannot be overwritten/i)
      ).toBeInTheDocument();

      assertNoTechnicalJargonInDOM(container);
    });
  });

  describe("One-Tap Support Diagnostic Quarantine & Zero Leakage", () => {
    it("exports complete diagnostic telemetry via clipboard while keeping the DOM 100% clean", async () => {
      let clipboardContent = "";
      const writeTextMock = vi.fn().mockImplementation((text: string) => {
        clipboardContent = text;
        return Promise.resolve();
      });

      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      await db.syncPullState.put({
        id: "biz-1:session",
        businessId: "biz-1",
        cursor: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
        pagesFetched: 0,
        entityCounts: {},
        lastCompletePullAt: null,
        lastPullStatus: "failed",
        lastPullErrorCode: "PULL_BATCH_HTTP_500",
        lastPullHttpStatus: 500,
        lastBatchId: "batch-uuid-777",
        lastFailedDataset: "sales_dataset",
        partialErrors: [],
      });

      const { container } = render(<SyncHealthPage />);

      const copyBtn = await screen.findByRole("button", { name: /Copy Support Info/i });
      expect(copyBtn).toBeInTheDocument();

      // Zero jargon before click
      assertNoTechnicalJargonInDOM(container);
      expect(container.innerHTML).not.toContain("PULL_BATCH_HTTP_500");
      expect(container.innerHTML).not.toContain("batch-uuid-777");

      fireEvent.click(copyBtn);

      await waitFor(() => {
        expect(writeTextMock).toHaveBeenCalledTimes(1);
      });

      // Telemetry payload is securely contained in the clipboard JSON
      expect(clipboardContent).toBeTruthy();
      const parsed = JSON.parse(clipboardContent);
      expect(parsed.backupStatus.lastPullErrorCode).toBe("PULL_BATCH_HTTP_500");
      expect(parsed.backupStatus.lastPullHttpStatus).toBe(500);
      expect(parsed.backupStatus.lastBatchId).toBe("batch-uuid-777");
      expect(parsed.backupStatus.lastFailedDataset).toBe("sales_dataset");
      expect(parsed.telemetry.coordinator.sessionId).toBe("coordinator-session-uuid-999");
      expect(parsed.storageDurability.persisted).toBe(true);

      // Visual feedback updates smoothly
      expect(screen.getByText("Support info copied")).toBeInTheDocument();

      // Zero jargon after copy click
      assertNoTechnicalJargonInDOM(container);
      expect(container.innerHTML).not.toContain("PULL_BATCH_HTTP_500");
      expect(container.innerHTML).not.toContain("batch-uuid-777");
    });
  });
});
