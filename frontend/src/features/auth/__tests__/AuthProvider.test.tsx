// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { AuthProvider, AUTH_WATCHDOG_TIMEOUT_MS, CurrentUserContext } from "../AuthProvider";

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

describe("AuthProvider Watchdog Circuit Breaker & Skeleton Layout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockReplace.mockClear();
    currentPathname = "/dashboard";
    mockLiveQueryResult = undefined;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("exports AUTH_WATCHDOG_TIMEOUT_MS as 4000", () => {
    expect(AUTH_WATCHDOG_TIMEOUT_MS).toBe(4000);
  });

  it("renders clean borderless skeleton while session resolution is pending (<4,000ms)", () => {
    mockLiveQueryResult = undefined;

    const { container } = render(
      <AuthProvider>
        <div data-testid="child-content">Protected Content</div>
      </AuthProvider>
    );

    // Child should not be rendered yet
    expect(screen.queryByTestId("child-content")).toBeNull();

    // Watchdog fallback should not be rendered yet
    expect(screen.queryByTestId("auth-watchdog-fallback")).toBeNull();

    // Verify wireframe stroke classes are NOT present in skeleton elements
    const borderOutlineElements = container.querySelectorAll(
      '[class*="border-outline-variant"], [class*="divide-outline-variant"]'
    );
    expect(borderOutlineElements.length).toBe(0);

    // Hero card, KPI grids, and lower card must be borderless
    const heroCard = container.querySelector(".rounded-3xl.p-4");
    expect(heroCard).not.toBeNull();
    expect(heroCard?.className).not.toContain("border-outline-variant");
    expect(heroCard?.className).not.toContain("border ");
  });

  it("trips watchdog circuit breaker after 4,000ms deadlock and triggers redirect to /login?force=true", () => {
    mockLiveQueryResult = undefined; // Stalled/deadlocked useLiveQuery

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

    // Circuit breaker is tripped
    expect(mockReplace).toHaveBeenCalledWith("/login?force=true");
    expect(screen.getByTestId("auth-watchdog-fallback")).toBeTruthy();
    expect(
      screen.getByText("Session resolution took longer than expected")
    ).toBeTruthy();
  });

  it("provides recoverable user action buttons in the watchdog fallback state", () => {
    mockLiveQueryResult = undefined;

    const originalLocation = window.location;
    const mockLocationReplace = vi.fn();
    delete (window as any).location;
    (window as any).location = {
      ...originalLocation,
      replace: mockLocationReplace,
      reload: vi.fn(),
    };

    render(
      <AuthProvider>
        <div data-testid="child-content">Protected Content</div>
      </AuthProvider>
    );

    act(() => {
      vi.advanceTimersByTime(AUTH_WATCHDOG_TIMEOUT_MS);
    });

    const signInBtn = screen.getByRole("button", { name: "Continue to Sign In" });
    fireEvent.click(signInBtn);
    expect(mockLocationReplace).toHaveBeenCalledWith("/login?force=true");

    const reloadBtn = screen.getByRole("button", { name: "Reload App" });
    fireEvent.click(reloadBtn);
    expect(window.location.reload).toHaveBeenCalled();

    (window as any).location = originalLocation;
  });

  it("cancels watchdog and renders children when session resolves to active user within 4,000ms", () => {
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

    // Resolved synchronously
    expect(screen.getByTestId("child-content")).toBeTruthy();
    expect(screen.getByText("Welcome Test Owner (BUSINESS_OWNER)")).toBeTruthy();

    // Advance time past 4,000ms — watchdog should NOT fire
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.queryByTestId("auth-watchdog-fallback")).toBeNull();
  });

  it("trips watchdog if needs-login route transition stalls beyond 4,000ms", () => {
    mockLiveQueryResult = { kind: "needs-login" };

    render(
      <AuthProvider>
        <div data-testid="child-content">Protected Content</div>
      </AuthProvider>
    );

    // Initial redirect triggered immediately by routing guard
    expect(mockReplace).toHaveBeenCalledWith("/login?force=true");

    // But if page transition doesn't complete and component stays mounted past 4,000ms
    act(() => {
      vi.advanceTimersByTime(AUTH_WATCHDOG_TIMEOUT_MS);
    });

    // Fallback UI mounts so user is not stuck on skeleton
    expect(screen.getByTestId("auth-watchdog-fallback")).toBeTruthy();
  });
});
