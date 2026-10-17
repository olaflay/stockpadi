// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { AuthProvider, AUTH_WATCHDOG_TIMEOUT_MS, CurrentUserContext } from "../AuthProvider";
import { AUTH_SESSION_SYNC_KEY } from "../auth-session-sync";

// Mock next/navigation
const mockReplace = vi.fn();
let currentPathname = "/dashboard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: vi.fn(),
  }),
  usePathname: () => currentPathname,
}));

// Mock legacy cleanup & session
vi.mock("../legacy-cleanup", () => ({
  removeLegacyTestUser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../session", () => ({
  refreshSession: vi.fn().mockResolvedValue(undefined),
  sessionExpiryFromNow: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
}));

vi.mock("@/lib/local-tenant", () => ({
  setLocalBusinessId: vi.fn().mockResolvedValue(undefined),
}));

// Mock useLiveQuery
type ResolvedState =
  | { kind: "active"; user: any }
  | { kind: "needs-login" }
  | { kind: "expired" }
  | { kind: "no-session" }
  | undefined;

let mockLiveQueryResult: ResolvedState = undefined;

vi.mock("dexie-react-hooks", () => ({
  useLiveQuery: (fn: any, deps: any) => mockLiveQueryResult,
}));

vi.mock("@/lib/db", () => ({
  db: {
    session: { get: vi.fn() },
    localUsers: { get: vi.fn() },
  },
  SESSION_SINGLETON_ID: "singleton",
}));

describe("AuthProvider Fast-Path Hydration & Non-Destructive Storage Supervisor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockReplace.mockClear();
    currentPathname = "/dashboard";
    mockLiveQueryResult = undefined;
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("exports AUTH_WATCHDOG_TIMEOUT_MS as 4000", () => {
    expect(AUTH_WATCHDOG_TIMEOUT_MS).toBe(4000);
  });

  it("hydrates instantly (0ms) from synchronous fast-path mirror when IndexedDB is stalled on cold start", () => {
    const mirrorUser = {
      id: "user-fast-1",
      fullName: "Fast Hydrated Owner",
      emailVerified: true,
      accountType: "BUSINESS_OWNER",
      permissions: [],
      businessId: "biz-fast-1",
      branchIds: ["branch-1"],
      businessStatus: "verified",
    };

    window.localStorage.setItem(
      AUTH_SESSION_SYNC_KEY,
      JSON.stringify({
        version: 1,
        userId: mirrorUser.id,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        user: mirrorUser,
        cachedAt: new Date().toISOString(),
      })
    );

    // Stalled IndexedDB connection
    mockLiveQueryResult = undefined;

    render(
      <AuthProvider>
        <CurrentUserContext.Consumer>
          {(user) => <div data-testid="child-content">Active User: {user?.fullName}</div>}
        </CurrentUserContext.Consumer>
      </AuthProvider>
    );

    // Hydrated immediately without waiting for IndexedDB
    expect(screen.getByTestId("child-content")).toBeTruthy();
    expect(screen.getByText("Active User: Fast Hydrated Owner")).toBeTruthy();
    expect(screen.queryByTestId("auth-watchdog-fallback")).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();

    // Past 4,000ms: user remains safely inside app and is NEVER redirected to /login
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.queryByTestId("auth-watchdog-fallback")).toBeNull();
    expect(screen.getByText("Active User: Fast Hydrated Owner")).toBeTruthy();
  });

  it("renders clean borderless skeleton while session resolution is pending when no mirror exists (<4,000ms)", () => {
    mockLiveQueryResult = undefined;

    const { container } = render(
      <AuthProvider>
        <div data-testid="child-content">Protected Content</div>
      </AuthProvider>
    );

    expect(screen.queryByTestId("child-content")).toBeNull();
    expect(screen.queryByTestId("auth-watchdog-fallback")).toBeNull();

    const borderOutlineElements = container.querySelectorAll(
      '[class*="border-outline-variant"], [class*="divide-outline-variant"]'
    );
    expect(borderOutlineElements.length).toBe(0);

    const heroCard = container.querySelector(".rounded-3xl.p-4");
    expect(heroCard).not.toBeNull();
    expect(heroCard?.className).not.toContain("border-outline-variant");
    expect(heroCard?.className).not.toContain("border ");
  });

  it("trips watchdog and mounts non-destructive in-place recovery modal without redirecting to /login when storage stalls past 4,000ms", () => {
    mockLiveQueryResult = undefined; // Stalled/deadlocked useLiveQuery with no local mirror

    render(
      <AuthProvider>
        <div data-testid="child-content">Protected Content</div>
      </AuthProvider>
    );

    expect(screen.queryByTestId("auth-watchdog-fallback")).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();

    // Advance time to 3,999ms — still waiting
    act(() => {
      vi.advanceTimersByTime(3999);
    });
    expect(screen.queryByTestId("auth-watchdog-fallback")).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();

    // Advance time past 4,000ms — watchdog fires
    act(() => {
      vi.advanceTimersByTime(1);
    });

    // CRITICAL: User is NEVER redirected to /login on storage stalls
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByTestId("auth-watchdog-fallback")).toBeTruthy();
    expect(
      screen.getByText("App storage is taking longer than usual — Tap to reload")
    ).toBeTruthy();
  });

  it("provides non-destructive recovery actions that reload the window safely preserving current URL", () => {
    mockLiveQueryResult = undefined;

    const originalLocation = window.location;
    const mockLocationReload = vi.fn();
    delete (window as any).location;
    (window as any).location = {
      ...originalLocation,
      reload: mockLocationReload,
      replace: vi.fn(),
    };

    render(
      <AuthProvider>
        <div data-testid="child-content">Protected Content</div>
      </AuthProvider>
    );

    act(() => {
      vi.advanceTimersByTime(AUTH_WATCHDOG_TIMEOUT_MS);
    });

    const reloadBtn = screen.getByRole("button", { name: "Tap to reload" });
    fireEvent.click(reloadBtn);

    // Safe in-place reload executed without altering route or deleting credentials
    expect(mockLocationReload).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();

    (window as any).location = originalLocation;
  });

  it("cancels watchdog and renders children when Dexie resolves active user within 4,000ms and syncs mirror", () => {
    const activeUser = {
      id: "user-1",
      fullName: "Test Owner",
      emailVerified: true,
      accountType: "BUSINESS_OWNER",
      permissions: [],
      businessId: "biz-1",
      branchIds: ["branch-1"],
      businessStatus: "verified",
    };

    mockLiveQueryResult = {
      kind: "active",
      user: activeUser,
    };

    render(
      <AuthProvider>
        <CurrentUserContext.Consumer>
          {(user) => (
            <div data-testid="child-content">
              Welcome {user?.fullName} ({user?.accountType})
            </div>
          )}
        </CurrentUserContext.Consumer>
      </AuthProvider>
    );

    expect(screen.getByTestId("child-content")).toBeTruthy();
    expect(screen.getByText("Welcome Test Owner (BUSINESS_OWNER)")).toBeTruthy();

    // Fast-path mirror was synchronized
    const savedMirror = JSON.parse(window.localStorage.getItem(AUTH_SESSION_SYNC_KEY) || "{}");
    expect(savedMirror.userId).toBe("user-1");
    expect(savedMirror.user.fullName).toBe("Test Owner");

    // Advance time past 4,000ms — watchdog should NOT fire
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.queryByTestId("auth-watchdog-fallback")).toBeNull();
  });

  it("redirects to /login and clears fast-path mirror when IndexedDB explicitly resolves needs-login", () => {
    // Pre-seed mirror
    window.localStorage.setItem(
      AUTH_SESSION_SYNC_KEY,
      JSON.stringify({
        version: 1,
        userId: "old-user",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        user: { id: "old-user", fullName: "Old", accountType: "WORKER" },
        cachedAt: new Date().toISOString(),
      })
    );

    mockLiveQueryResult = { kind: "needs-login" };

    render(
      <AuthProvider>
        <div data-testid="child-content">Protected Content</div>
      </AuthProvider>
    );

    // Initial redirect triggered by authoritative no-session from IndexedDB
    expect(mockReplace).toHaveBeenCalledWith("/login?force=true");

    // Fast-path mirror is cleared so old session cannot be used
    expect(window.localStorage.getItem(AUTH_SESSION_SYNC_KEY)).toBeNull();
  });
});
