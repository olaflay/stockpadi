import { describe, expect, it } from "vitest";
import { parseNumericDraft } from "../numeric-input";

describe("parseNumericDraft", () => {
  it("allows the user to clear a prefilled numeric field", () => {
    expect(parseNumericDraft("")).toBe("");
  });

  it("preserves whole, decimal, and in-progress replacement values", () => {
    expect(parseNumericDraft("35")).toBe("35");
    expect(parseNumericDraft("30.5")).toBe("30.5");
    expect(parseNumericDraft("30.")).toBe("30.");
  });
});
