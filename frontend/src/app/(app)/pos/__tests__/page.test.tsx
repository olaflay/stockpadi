// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { db } from "@/lib/db";
import { CurrentUserContext } from "@/features/auth/AuthProvider";
import { ToastProvider } from "@/components/ui/Toast";
import type { CurrentUser } from "@/features/auth/use-current-user";

/**
 * Role-gating smoke test: a role with no `process_sale` permission must
 * see PermissionDenied, not the real POS screen. Renders the actual page
 * component (jsdom, per-file override — see vitest.config.mts which
 * otherwise runs under plain Node for the fake-indexeddb suites) with
 * next/navigation mocked and CurrentUserContext supplied directly,
 * bypassing AuthProvider's own Dexie session lookup.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/pos",
}));

const { default: PosPage } = await import("@/app/(app)/pos/page");

function renderAs(user: CurrentUser) {
  return render(
    <CurrentUserContext.Provider value={user}>
      <ToastProvider>
        <PosPage />
      </ToastProvider>
    </CurrentUserContext.Provider>
  );
}

describe("POS page role gating", () => {
  beforeEach(async () => {
    await db.products.clear();
    cleanup();
  });

  it("renders PermissionDenied when no authoritative account context exists", async () => {
    renderAs({ id: "user-1", fullName: "Unknown", role: "cashier" });

    expect(await screen.findByText("You don't have access to this screen")).toBeInTheDocument();
    expect(screen.queryByText(/Ask someone with the/)).toHaveTextContent("account type");
  });

  it("does not render PermissionDenied for a Worker account", async () => {
    renderAs({ id: "user-3", fullName: "Worker", role: "cashier", accountType: "WORKER" });

    // Give the product useLiveQuery a tick to resolve to its empty-state.
    await screen.findByText("Sell");
    expect(screen.queryByText("You don't have access to this screen")).not.toBeInTheDocument();
  });
});
