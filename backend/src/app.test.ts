import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createApp, handleRequest, resetRequestRateLimitForTests } from "./app.js";

const servers: Array<ReturnType<typeof createServer>> = [];

afterEach(async () => {
  resetRequestRateLimitForTests();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

async function startBackend() {
  const server = createServer(createApp());
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Backend test server did not bind to a TCP port");
  return `http://127.0.0.1:${address.port}`;
}

describe("backend service routes", () => {
  // Independent inventory of the public HTTP contract. A wrong-method probe
  // checks route recognition without invoking a handler or changing data.
  const resourceId = "00000000-0000-0000-0000-000000000000";
  const routeMethods = [
    ["/", "GET"], ["/health", "GET"], ["/api/health", "GET"], ["/api/version", "GET"],
    ["/api/businesses/register", "POST"], ["/api/businesses/branches", "GET, POST"],
    [`/api/businesses/branches/${resourceId}`, "PATCH, DELETE"], ["/api/business/profile", "GET, PATCH"],
    ["/api/customers", "GET, POST"], [`/api/customers/${resourceId}`, "GET"],
    ["/api/customers/credit-payment", "POST"], ["/api/purchases", "GET"], ["/api/purchases/receive", "POST"],
    ["/api/expenses", "GET, POST"], ["/api/products", "GET, POST"], ["/api/categories", "GET"],
    ["/api/inventory/adjust", "POST"], ["/api/inventory/stock-count", "POST"], ["/api/inventory", "GET"],
    ["/api/reports/summary", "GET, POST"], ["/api/reconciliation/summary", "GET, POST"],
    ["/api/reconciliation/submit", "POST"], ["/api/reconciliation/history", "GET"],
    ["/api/workers", "GET, POST"], ["/api/workers/audit", "GET"], [`/api/workers/${resourceId}`, "GET"],
    [`/api/workers/${resourceId}/action`, "POST"], ["/api/admin", "POST"], ["/api/broadcasts", "GET"],
    ["/api/account-context", "POST"], ["/api/sales", "GET"], ["/api/sales/void", "POST"],
    ["/api/sales/refund", "POST"], ["/api/auth/email-verification/send", "POST"],
    ["/api/auth/email-verification/verify", "POST"], ["/api/auth/password/update", "POST"],
    ["/api/auth/password/recovery/request", "POST"], ["/api/auth/password/recovery/complete", "POST"],
    ["/api/sync/pull", "GET"], ["/api/sync/health", "GET"], ["/api/sync/push", "POST"],
  ] as const;

  const publicPaths = new Set<string>([
    "/", "/health", "/api/health", "/api/version", "/api/businesses/register",
    "/api/auth/password/recovery/request", "/api/auth/password/recovery/complete",
  ]);
  const protectedMethods = routeMethods
    .filter(([path]) => !publicPaths.has(path))
    .flatMap(([path, methods]) => methods.split(", ").map((method) => [method, path] as const));

  it.each(protectedMethods)("requires authentication for %s %s", async (method, path) => {
    const response = await handleRequest(new Request(`http://localhost${path}`, {
      method,
      ...(method === "POST" || method === "PATCH" ? { body: "{}" } : {}),
    }));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });

  it.each(routeMethods)("recognizes %s and advertises its supported methods", async (path, methods) => {
    const response = await handleRequest(new Request(`http://localhost${path}`, { method: "PUT" }));
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe(methods);
    expect(await response.json()).toMatchObject({ error: { code: "METHOD_NOT_ALLOWED" } });
  });

  it.each(["/", "/health", "/health?probe=deployment"])("returns service health for GET %s", async (path) => {
    const backendUrl = await startBackend();
    const response = await fetch(`${backendUrl}${path}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      service: "backend",
      component: "backend",
      environment: "local",
      apiVersion: "v1",
      buildVersion: "local",
      supabaseProjectRef: null,
    });
  });

  it("reports the configured service name, not a hardcoded brand", async () => {
    const backendUrl = await startBackend();
    const response = await fetch(`${backendUrl}/health`);
    const body = await response.json() as { service: string };

    expect(body.service).toBe("backend");
  });

  it("exposes safe version metadata and compatibility headers", async () => {
    const backendUrl = await startBackend();
    const response = await fetch(`${backendUrl}/api/version`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ build: "local", minClient: "0.1.0" });
    expect(response.headers.get("x-build-version")).toBe("local");
    expect(response.headers.get("x-min-client-version")).toBe("0.1.0");
  });

  it("returns 426 to an unsupported client and leaves the request handler untouched", async () => {
    const backendUrl = await startBackend();
    const previous = process.env.MIN_CLIENT_VERSION;
    process.env.MIN_CLIENT_VERSION = "0.2.0";
    try {
      const response = await fetch(`${backendUrl}/api/account-context`, {
        method: "POST",
        headers: { "x-client-version": "0.1.0", "x-forwarded-for": "old-client-version-test" },
      });
      expect(response.status).toBe(426);
      expect(response.headers.get("x-min-client-version")).toBe("0.2.0");
      expect(await response.json()).toEqual({
        error: { code: "CLIENT_UPGRADE_REQUIRED", message: "This app version must be updated before it can sync." },
      });
    } finally {
      if (previous === undefined) delete process.env.MIN_CLIENT_VERSION;
      else process.env.MIN_CLIENT_VERSION = previous;
    }
  });

  it("keeps accepting requests from the previous client version while the minimum remains unchanged", async () => {
    const backendUrl = await startBackend();
    const response = await fetch(`${backendUrl}/api/account-context`, {
      method: "POST",
      headers: { "x-client-version": "0.1.0", "x-forwarded-for": "supported-client-version-test" },
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("x-build-version")).toBe("local");
  });

  it("returns a JSON 404 for an unknown route", async () => {
    const backendUrl = await startBackend();
    const response = await fetch(`${backendUrl}/missing`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "NOT_FOUND", message: "Route not found" } });
  });

  it("routes worker actions through authentication", async () => {
    const backendUrl = await startBackend();
    const response = await fetch(`${backendUrl}/api/workers/00000000-0000-0000-0000-000000000000/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "deactivate" }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "UNAUTHENTICATED", message: "Missing bearer token" } });
  });

  it("rate-limits repeated API requests without rate-limiting health checks", async () => {
    const backendUrl = await startBackend();
    for (let index = 0; index < 120; index += 1) {
      const response = await fetch(`${backendUrl}/api/account-context`, {
        method: "POST",
        headers: { "x-forwarded-for": "rate-limit-test" },
      });
      expect(response.status).toBe(401);
    }

    const limited = await fetch(`${backendUrl}/api/account-context`, {
      method: "POST",
      headers: { "x-forwarded-for": "rate-limit-test" },
    });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();

    const health = await fetch(`${backendUrl}/health`, {
      headers: { "x-forwarded-for": "rate-limit-test" },
    });
    expect(health.status).toBe(200);
  });

  it("rejects oversized request metadata before authentication or body parsing", async () => {
    const backendUrl = await startBackend();
    const response = await fetch(`${backendUrl}/api/sync/push`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "oversized-request-test",
      },
      body: "x".repeat(1024 * 1024 + 1),
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: { code: "PAYLOAD_TOO_LARGE", message: "Request body must not exceed 1048576 bytes" } });
  });
});
