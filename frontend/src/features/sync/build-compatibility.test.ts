// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

describe("client/server compatibility gate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("pauses an old client when the new backend requires a newer client", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ build: "server-build", minClient: "0.2.0" }), {
      status: 200,
      headers: { "content-type": "application/json", "x-build-version": "server-build", "x-min-client-version": "0.2.0" },
    })));
    const { ensureBackendBuildCompatibility, isSyncPausedForClientUpgrade } = await import("./build-compatibility");
    const result = await ensureBackendBuildCompatibility(true);
    expect(result).toEqual({ compatible: false, verified: true });
    expect(isSyncPausedForClientUpgrade()).toBe(true);
  });

  it("continues safely with an older backend that has no version endpoint", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not found", { status: 404 })));
    const { ensureBackendBuildCompatibility } = await import("./build-compatibility");
    await expect(ensureBackendBuildCompatibility(true)).resolves.toEqual({ compatible: true, verified: false });
  });

  it("recognizes semver floors without requiring the backend and frontend build hashes to match", async () => {
    const { isClientVersionBelow } = await import("./build-compatibility");
    expect(isClientVersionBelow("0.1.9", "0.2.0")).toBe(true);
    expect(isClientVersionBelow("0.2.0", "0.2.0")).toBe(false);
    expect(isClientVersionBelow("0.3.0", "0.2.0")).toBe(false);
  });
});
