import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createApp, resetRequestRateLimitForTests } from "./app.js";

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
        headers: { "x-forwarded-for": "rate-limit-test" },
      });
      expect(response.status).toBe(401);
    }

    const limited = await fetch(`${backendUrl}/api/account-context`, {
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
