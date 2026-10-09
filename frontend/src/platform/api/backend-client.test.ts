import { beforeEach, describe, expect, it, vi } from "vitest";
import { BackendRequestError, NetworkUnavailableError, serverGet, serverPost } from "@/platform/api/backend-client";

const getSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    auth: {
      getSession,
      refreshSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  }),
}));

function response(status: number, body: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, json: vi.fn().mockResolvedValue(body) };
}

describe("backend client transport policy", () => {
  beforeEach(() => {
    getSession.mockResolvedValue({ data: { session: { access_token: "test-token" } } });
    vi.unstubAllGlobals();
  });

  it("retries transient GET network failures a bounded number of times", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(response(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(serverGet<{ ok: boolean }>("/health")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries transient server responses and then returns the successful read", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(503, { error: { code: "TEMPORARY", message: "busy" } }))
      .mockResolvedValueOnce(response(200, { value: 42 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(serverGet<{ value: number }>("/health")).resolves.toEqual({ value: 42 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("applies a finite caller timeout to reads", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, init: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })));

    await expect(serverGet("/health", { timeoutMs: 10 })).rejects.toBeInstanceOf(NetworkUnavailableError);
  });

  it("does not transport-retry a POST because the durable outbox owns mutation retries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(503, { error: { code: "TEMPORARY", message: "busy" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(serverPost("/api/sync/push", { batch: [] })).rejects.toEqual(expect.any(BackendRequestError));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
