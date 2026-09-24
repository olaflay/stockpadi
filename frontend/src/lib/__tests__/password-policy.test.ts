import { describe, expect, it } from "vitest";
import { getPasswordRequirements, meetsPasswordPolicy } from "@stockpadi/contracts";

describe("password policy", () => {
  it("requires every live requirement before reporting a strong password", () => {
    expect(meetsPasswordPolicy("password1!")).toBe(false);
    expect(meetsPasswordPolicy("PASSWORD1!")).toBe(false);
    expect(meetsPasswordPolicy("Password!!")).toBe(false);
    expect(meetsPasswordPolicy("Password123")).toBe(false);
    expect(meetsPasswordPolicy("Password1!")).toBe(true);
  });

  it("returns separate, actionable live checks", () => {
    const checks = getPasswordRequirements("Password1!");
    expect(checks).toHaveLength(5);
    expect(checks.every((check) => check.passed)).toBe(true);
  });
});
