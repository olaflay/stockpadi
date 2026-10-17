// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AUTH_SESSION_SYNC_KEY,
  clearFastPathAuthSession,
  readFastPathAuthSession,
  updateFastPathAuthSessionExpiry,
  updateFastPathAuthUser,
  writeFastPathAuthSession,
} from "../auth-session-sync";
import type { CurrentUser } from "../use-current-user";

describe("auth-session-sync synchronous local storage mirror", () => {
  const sampleUser: CurrentUser = {
    id: "user-test-1",
    fullName: "Test Retailer",
    emailVerified: true,
    accountType: "BUSINESS_OWNER",
    permissions: [],
    businessId: "biz-123",
    branchIds: ["branch-a"],
    businessStatus: "verified",
  };

  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("returns null when mirror does not exist in localStorage", () => {
    expect(readFastPathAuthSession()).toBeNull();
  });

  it("writes and reads back a valid fast-path session synchronously", () => {
    const futureExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    writeFastPathAuthSession(sampleUser, futureExpiry);

    const session = readFastPathAuthSession();
    expect(session).not.toBeNull();
    expect(session?.userId).toBe("user-test-1");
    expect(session?.user.fullName).toBe("Test Retailer");
    expect(session?.user.accountType).toBe("BUSINESS_OWNER");
    expect(session?.expiresAt).toBe(futureExpiry);
  });

  it("returns null when the stored session is expired", () => {
    const pastExpiry = new Date(Date.now() - 1000).toISOString();
    writeFastPathAuthSession(sampleUser, pastExpiry);

    expect(readFastPathAuthSession()).toBeNull();
  });

  it("updates session expiry cleanly in the mirror", () => {
    const initialExpiry = new Date(Date.now() + 10000).toISOString();
    const extendedExpiry = new Date(Date.now() + 60000).toISOString();
    writeFastPathAuthSession(sampleUser, initialExpiry);

    updateFastPathAuthSessionExpiry(extendedExpiry);

    const updated = readFastPathAuthSession();
    expect(updated?.expiresAt).toBe(extendedExpiry);
  });

  it("updates user attributes without affecting session validity", () => {
    const expiry = new Date(Date.now() + 100000).toISOString();
    writeFastPathAuthSession(sampleUser, expiry);

    updateFastPathAuthUser({ emailVerified: true, businessStatus: "verified" });

    const updated = readFastPathAuthSession();
    expect(updated?.user.emailVerified).toBe(true);
    expect(updated?.user.businessStatus).toBe("verified");
  });

  it("clears the session mirror on clearFastPathAuthSession", () => {
    const expiry = new Date(Date.now() + 100000).toISOString();
    writeFastPathAuthSession(sampleUser, expiry);
    expect(window.localStorage.getItem(AUTH_SESSION_SYNC_KEY)).toBeTruthy();

    clearFastPathAuthSession();
    expect(window.localStorage.getItem(AUTH_SESSION_SYNC_KEY)).toBeNull();
    expect(readFastPathAuthSession()).toBeNull();
  });

  it("safely handles corrupted JSON without crashing", () => {
    window.localStorage.setItem(AUTH_SESSION_SYNC_KEY, "invalid-json{{");
    expect(readFastPathAuthSession()).toBeNull();
  });
});
