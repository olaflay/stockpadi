import { describe, expect, it } from "vitest";
import { isOfflineRoute } from "../offline-routes";

describe("offline route policy", () => {
  it.each(["/pos", "/products", "/products/new", "/expenses/new", "/settings/data"])(
    "allows local-data route %s",
    (pathname) => expect(isOfflineRoute(pathname)).toBe(true),
  );

  it.each(["/staff", "/settings/branches", "/admin", "/login", "/products/abc", "/sales/receipt-id"])(
    "keeps online-only route %s behind the in-app boundary",
    (pathname) => expect(isOfflineRoute(pathname)).toBe(false),
  );
});
