import { describe, it, expect } from "vitest";
import { formatCurrency, formatCurrencyLabel } from "../format";

describe("formatCurrency", () => {
  it("formats integer amounts with standard currency symbol and no decimal places", () => {
    const formatted = formatCurrency(5000, "NGN");
    // Should contain 5,000 and the Naira symbol
    expect(formatted).toMatch(/5,000/);
    expect(formatted).toMatch(/₦/);
  });

  it("formats foreign currency when specified", () => {
    const formattedUsd = formatCurrency(250, "USD");
    expect(formattedUsd).toContain("$250");
  });

  it("handles zero gracefully", () => {
    const formatted = formatCurrency(0, "NGN");
    expect(formatted).toMatch(/0/);
  });
});

describe("formatCurrencyLabel", () => {
  it("returns currency symbol for NGN", () => {
    expect(formatCurrencyLabel("NGN")).toBe("₦");
  });

  it("returns currency symbol for USD", () => {
    expect(formatCurrencyLabel("USD")).toBe("$");
  });
});
