// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({ auth: { getSession } }),
}));

import { serverGet } from "./server-client";

describe("browser backend routing", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getSession.mockResolvedValue({ data: { session: { access_token: "worker-token" } } });
    process.env.NEXT_PUBLIC_BACKEND_URL = "http://localhost:8787";
  });

  it("uses the same-origin Next.js proxy instead of the device's localhost", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ok: true }));

    await serverGet("/api/sync/pull");

    expect(fetchMock).toHaveBeenCalledWith("/api/sync/pull", expect.objectContaining({
      headers: { Authorization: "Bearer worker-token" },
    }));
  });
});
