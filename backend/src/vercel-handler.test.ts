import { describe, expect, it } from "vitest";
import vercelHandler, { publicPathFor } from "../api/index.js";

describe("Vercel backend adapter", () => {
  it.each([
    ["/api?__path=health", "/health"],
    ["/api?__path=api%2Freports%2Fsummary&from=2026-09-01", "/api/reports/summary"],
    ["/api?__path=", "/"],
  ])("restores the public path from %s", (rewrittenUrl, publicUrl) => {
    const request = new Request(`https://backend.example.com${rewrittenUrl}`);

    expect(publicPathFor(request)).toBe(publicUrl);
  });

  it("serves health through the deployed Web handler", async () => {
    const response = await vercelHandler.fetch(new Request("https://backend.example.com/api?__path=health"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", service: "stockpadi-backend" });
  });

  it("loads the application router for non-health routes", async () => {
    const response = await vercelHandler.fetch(new Request("https://backend.example.com/api?__path=missing"));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "NOT_FOUND", message: "Route not found" } });
  });
});
