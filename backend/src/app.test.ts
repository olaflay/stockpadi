import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";

const servers: Array<ReturnType<typeof createServer>> = [];

afterEach(async () => {
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
    expect(await response.json()).toEqual({ status: "ok", service: "stockpadi-backend" });
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
});
