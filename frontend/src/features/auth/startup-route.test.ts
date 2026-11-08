// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { resolveStartupDestination, withStartupTimeout } from "./startup-route";

function store(overrides: Partial<Parameters<typeof resolveStartupDestination>[0]> = {}) {
  return {
    removeLegacyUser: vi.fn().mockResolvedValue(undefined),
    getSession: vi.fn().mockResolvedValue({ userId: "owner-1", expiresAt: "2099-01-01T00:00:00.000Z" }),
    getUser: vi.fn().mockResolvedValue({ accountType: "BUSINESS_OWNER", emailVerified: true }),
    hasBusinessProfile: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe("startup routing", () => {
  it("opens the dashboard from local state without a network dependency", async () => {
    await expect(resolveStartupDestination(store(), 0)).resolves.toBe("/dashboard");
  });

  it("sends an expired local session to login", async () => {
    const local = store({ getSession: vi.fn().mockResolvedValue({ userId: "owner-1", expiresAt: "2020-01-01T00:00:00.000Z" }) });
    await expect(resolveStartupDestination(local, Date.parse("2021-01-01"))).resolves.toBe("/login?force=true");
    expect(local.getUser).not.toHaveBeenCalled();
  });

  it("turns a stalled IndexedDB read into a recoverable timeout", async () => {
    vi.useFakeTimers();
    const pending = new Promise<never>(() => undefined);
    const result = withStartupTimeout(pending, 50);
    const assertion = expect(result).rejects.toThrow("LOCAL_WORKSPACE_TIMEOUT");
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    vi.useRealTimers();
  });
});
