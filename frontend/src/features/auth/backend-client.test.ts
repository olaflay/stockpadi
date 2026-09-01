import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({ auth: { getSession } }),
}));

import { BackendError, callBackend } from "./backend-client";

describe("callBackend", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.NEXT_PUBLIC_BACKEND_URL = "https://backend.example.com";
  });

  it("omits Authorization when signup has no session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ userId: "user-1" }));

    await callBackend("register-business", { email: "owner@example.com" });

    expect(fetchMock).toHaveBeenCalledWith("https://backend.example.com/api/businesses/register", expect.objectContaining({
      headers: { "Content-Type": "application/json" },
    }));
  });

  it("includes Authorization when a session exists", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "token-1" } } });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ok: true }));

    await callBackend("account-context", {});

    expect(fetchMock).toHaveBeenCalledWith("https://backend.example.com/api/account-context", expect.objectContaining({
      headers: { "Content-Type": "application/json", Authorization: "Bearer token-1" },
    }));
  });

  it("surfaces the backend duplicate-email message", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      error: { code: "EMAIL_ALREADY_REGISTERED", message: "An account with this email already exists. Sign in instead." },
    }, { status: 409 }));

    const request = callBackend("register-business", { email: "owner@example.com" });

    await expect(request).rejects.toEqual(expect.objectContaining<Partial<BackendError>>({
      status: 409,
      code: "EMAIL_ALREADY_REGISTERED",
      message: "An account with this email already exists. Sign in instead.",
    }));
  });
});
