import { describe, expect, it } from "vitest";
import { accountTypeForLegacyRole, hasCapability } from "./model";

describe("authorization model", () => {
  it("maps legacy roles without changing existing data", () => {
    expect(accountTypeForLegacyRole("super_admin")).toBe("ADMIN");
    expect(accountTypeForLegacyRole("owner")).toBe("BUSINESS_OWNER");
    expect(accountTypeForLegacyRole("cashier")).toBe("WORKER");
  });

  it("lets worker access be capability-driven while preserving owner/admin access", () => {
    expect(hasCapability("WORKER", ["sales.create"], "sales.create")).toBe(true);
    expect(hasCapability("WORKER", ["sales.create"], "inventory.adjust")).toBe(false);
    expect(hasCapability("BUSINESS_OWNER", [], "staff.manage")).toBe(true);
    expect(hasCapability("ADMIN", [], "staff.manage")).toBe(true);
  });
});
