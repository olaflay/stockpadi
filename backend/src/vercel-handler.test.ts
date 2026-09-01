import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import vercelHandler, { restorePublicUrl } from "../api/index.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

async function startVercelHandler() {
  const server = createServer(vercelHandler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Vercel handler test server did not bind");
  return `http://127.0.0.1:${address.port}`;
}

describe("Vercel backend adapter", () => {
  it.each([
    ["/api?__path=health", "/health", "/health"],
    ["/api?__path=api%2Freports%2Fsummary&from=2026-09-01", "/api/reports/summary", "/api/reports/summary?from=2026-09-01"],
    ["/api?__path=", "/", "/"],
  ])("restores the public URL from %s", (rewrittenUrl, publicPath, publicUrl) => {
    const request = { headers: { host: "backend.example.com" }, url: rewrittenUrl };

    expect(restorePublicUrl(request)).toBe(publicPath);
    expect(request.url).toBe(publicUrl);
  });

  it("serves health through the deployed Node handler", async () => {
    const baseUrl = await startVercelHandler();
    const response = await fetch(`${baseUrl}/api?__path=health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", service: "stockpadi-backend" });
  });

  it("loads the application router for non-health routes", async () => {
    const baseUrl = await startVercelHandler();
    const response = await fetch(`${baseUrl}/api?__path=missing`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "NOT_FOUND", message: "Route not found" } });
  });
});
