import { describe, expect, it } from "vitest";
import { validateStartingStock } from "@/features/inventory/starting-stock";

describe("validateStartingStock", () => {
  it("rejects a blank field as required", () => {
    expect(validateStartingStock("", null, 1)).toMatchObject({ ok: false, reason: "blank", quantity: null });
  });

  it("rejects whitespace-only input", () => {
    expect(validateStartingStock("   ", null, 1).ok).toBe(false);
  });

  it("rejects zero", () => {
    expect(validateStartingStock("0", null, 1)).toMatchObject({ ok: false, reason: "invalid", error: expect.any(String) });
  });

  it("rejects negative stock", () => {
    expect(validateStartingStock("-3", null, 1)).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("rejects non-numeric input", () => {
    expect(validateStartingStock("a lot", null, 1)).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("accepts a positive whole number and returns its quantity", () => {
    expect(validateStartingStock("12", null, 1)).toEqual({ ok: true, error: null, quantity: 12 });
  });

  it("accepts a decimal quantity for weighed units", () => {
    expect(validateStartingStock("2.5", null, 1)).toMatchObject({ ok: true, quantity: 2.5 });
  });

  it("does not require a branch in a single-branch store", () => {
    expect(validateStartingStock("5", null, 1).ok).toBe(true);
  });

  it("requires a branch in a multi-branch store", () => {
    expect(validateStartingStock("5", null, 3)).toMatchObject({ ok: false, reason: "branch" });
  });

  it("accepts stock once a branch is chosen in a multi-branch store", () => {
    expect(validateStartingStock("5", "branch-1", 3)).toMatchObject({ ok: true, quantity: 5 });
  });
});