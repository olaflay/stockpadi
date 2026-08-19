import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";
import { setLocalBusinessId } from "@/lib/local-tenant";

// Test fixtures historically omit businessId. Keep those fixtures readable in
// the test-only context while production code requires an active tenant.
beforeEach(async () => {
  await setLocalBusinessId("test-business");
});
