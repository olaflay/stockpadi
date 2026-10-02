import { beforeEach, describe, expect, it } from "vitest";
import { db, SESSION_SINGLETON_ID } from "@/lib/db";
import { startSession, refreshSession, clearSession, readSessionState } from "../session";

describe("session management & expiry", () => {
  beforeEach(async () => {
    await db.session.clear();
  });

  it("reports 'no-session' when no local session exists", async () => {
    const state = await readSessionState();
    expect(state).toEqual({ status: "no-session" });
  });

  it("creates active session with valid expiry window", async () => {
    await startSession("user-123");

    const state = await readSessionState();
    expect(state.status).toBe("active");
    if (state.status === "active") {
      expect(state.userId).toBe("user-123");
    }

    const saved = await db.session.get(SESSION_SINGLETON_ID);
    expect(saved).toBeDefined();
    expect(saved?.userId).toBe("user-123");
    expect(new Date(saved!.expiresAt).getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);
  });

  it("detects expired session when expiresAt is in the past", async () => {
    const pastTime = new Date(Date.now() - 1000 * 60).toISOString(); // 1 minute ago
    await db.session.put({
      id: SESSION_SINGLETON_ID,
      userId: "user-old",
      deviceId: "device-old",
      expiresAt: pastTime,
    });

    const state = await readSessionState();
    expect(state).toEqual({ status: "expired" });
  });

  it("slides session expiry forward on refreshSession", async () => {
    const originalExpiry = new Date(Date.now() + 1000 * 60 * 60).toISOString(); // 1 hour ahead
    await db.session.put({
      id: SESSION_SINGLETON_ID,
      userId: "user-active",
      deviceId: "device-active",
      expiresAt: originalExpiry,
    });

    await refreshSession();

    const refreshed = await db.session.get(SESSION_SINGLETON_ID);
    expect(refreshed).toBeDefined();
    expect(new Date(refreshed!.expiresAt).getTime()).toBeGreaterThan(new Date(originalExpiry).getTime());
  });

  it("clears session completely on logout", async () => {
    await startSession("user-to-logout");
    expect((await readSessionState()).status).toBe("active");

    await clearSession();

    expect(await readSessionState()).toEqual({ status: "no-session" });
    expect(await db.session.get(SESSION_SINGLETON_ID)).toBeUndefined();
  });
});
