import { expect, it } from "vitest";
import { adminReviewRoute } from "../admin-review-route";

it("preserves only a store review path on the application's origin", () => {
  const path = "/admin/businesses/12ce0000-1234-1234-1234-123456789abc";
  expect(adminReviewRoute(path)).toBe(path);
  for (const unsafe of [null, "//example.test" + path, "https://example.test" + path, "/admin/businesses/../settings", path + "?redirect=//example.test"]) {
    expect(adminReviewRoute(unsafe)).toBeNull();
  }
});
