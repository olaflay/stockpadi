import { beforeAll, describe, expect, it, vi } from "vitest";

const mockAddEventListeners = vi.fn();
let capturedConfig: Record<string, unknown> | null = null;

vi.mock("serwist", () => {
  return {
    Serwist: class MockSerwist {
      constructor(config: Record<string, unknown>) {
        capturedConfig = config;
      }
      addEventListeners = mockAddEventListeners;
    },
    NetworkFirst: class MockNetworkFirst {
      constructor(public options: Record<string, unknown>) {}
    },
    ExpirationPlugin: class MockExpirationPlugin {
      constructor(public options: Record<string, unknown>) {}
    },
  };
});

vi.mock("@serwist/next/worker", () => ({
  defaultCache: [{ matcher: "mock-default-cache", handler: "mock-handler" }],
}));

describe("Service Worker configuration (sw.ts)", () => {
  beforeAll(async () => {
    vi.stubGlobal("self", {
      __SW_MANIFEST: ["/offline", "/favicon.ico"],
    });

    // Import sw once to capture initialization
    await import("../sw");
  });

  it("configures Serwist with precache, navigation preload, and lifecycle flags", () => {
    expect(capturedConfig).toBeDefined();
    expect(capturedConfig?.skipWaiting).toBe(true);
    expect(capturedConfig?.clientsClaim).toBe(true);
    expect(capturedConfig?.navigationPreload).toBe(true);
    expect(capturedConfig?.precacheEntries).toEqual(["/offline", "/favicon.ico"]);
    expect(mockAddEventListeners).toHaveBeenCalledOnce();
  });

  it("registers navigation caching strategy with 3-second network timeout", () => {
    const runtimeCaching = capturedConfig?.runtimeCaching as Array<{
      matcher: (options: { request: Request; sameOrigin: boolean }) => boolean;
      handler: { options: { cacheName: string; networkTimeoutSeconds: number } };
    }>;

    expect(runtimeCaching).toBeDefined();
    const navRule = runtimeCaching[0];
    expect(navRule.handler.options.cacheName).toBe("stockpadi-navigation-local");
    expect(navRule.handler.options.networkTimeoutSeconds).toBe(3);

    // Test matcher behavior: sameOrigin navigation
    const sameOriginNavReq = new Request("https://example.com/pos", {
      headers: { accept: "text/html,application/xhtml+xml" },
    });
    expect(navRule.matcher({ request: sameOriginNavReq, sameOrigin: true })).toBe(true);

    // Test matcher behavior: cross-origin is ignored
    expect(navRule.matcher({ request: sameOriginNavReq, sameOrigin: false })).toBe(false);

    // Test matcher behavior: same-origin non-html
    const sameOriginImgReq = new Request("https://example.com/logo.png", {
      headers: { accept: "image/png" },
    });
    expect(navRule.matcher({ request: sameOriginImgReq, sameOrigin: true })).toBe(false);
  });

  it("configures offline document fallback to the precached static document", () => {
    const fallbacks = capturedConfig?.fallbacks as {
      entries: Array<{
        url: string;
        matcher: (options: { request: { destination: string } }) => boolean;
      }>;
    };

    expect(fallbacks).toBeDefined();
    expect(fallbacks.entries).toHaveLength(1);
    const entry = fallbacks.entries[0];
    expect(entry.url).toBe("/offline.html");
    expect(entry.matcher({ request: { destination: "document" } })).toBe(true);
    expect(entry.matcher({ request: { destination: "image" } })).toBe(false);
  });
});
