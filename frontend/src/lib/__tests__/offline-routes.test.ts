import { describe, expect, it } from "vitest";
import { isOfflineRoute, offlineDocumentCacheKey } from "../offline-routes";

describe("offline route policy", () => {
  it.each(["/pos", "/products", "/sales/receipt-id", "/customers/customer-id", "/settings/data"])(
    "allows local-data route %s",
    (pathname) => expect(isOfflineRoute(pathname)).toBe(true),
  );

  it.each(["/staff", "/settings/branches", "/admin", "/login", "/products/new", "/products/import", "/expenses/new", "/purchases"])(
    "keeps online-only route %s behind the in-app boundary",
    (pathname) => expect(isOfflineRoute(pathname)).toBe(false),
  );

  it("shares cached documents for local filters while keeping unrelated cache keys distinct", () => {
    expect(offlineDocumentCacheKey(new URL("https://app.example/sales?date=2026-11-28&own=1&branch=a"))).toBe("/sales");
    expect(offlineDocumentCacheKey(new URL("https://app.example/sales?other=1"))).toBe("/sales?other=1");
    expect(offlineDocumentCacheKey(new URL("https://app.example/products?search=milk"))).toBe("/products?search=milk");
    expect(offlineDocumentCacheKey(new URL("https://app.example/products?filter=low-stock"))).toBe("/products");
    expect(offlineDocumentCacheKey(new URL("https://app.example/contacts?filter=debtors"))).toBe("/contacts");
  });
});
