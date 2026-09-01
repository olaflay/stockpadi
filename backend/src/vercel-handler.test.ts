import { describe, expect, it } from "vitest";
import { restorePublicUrl } from "../api/index.js";

describe("Vercel backend adapter", () => {
  it.each([
    ["/api?__path=health", "/health"],
    ["/api?__path=api%2Freports%2Fsummary&from=2026-09-01", "/api/reports/summary?from=2026-09-01"],
    ["/api?__path=", "/"],
  ])("restores the public URL from %s", (rewrittenUrl, publicUrl) => {
    const request = { headers: { host: "backend.example.com" }, url: rewrittenUrl };

    restorePublicUrl(request);

    expect(request.url).toBe(publicUrl);
  });
});
