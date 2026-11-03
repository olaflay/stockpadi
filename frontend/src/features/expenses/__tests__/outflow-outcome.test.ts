import { describe, expect, it } from "vitest";
import { deliveryOutcomeMessage, expenseOutcomeMessage } from "@/features/expenses/outflow-outcome";

describe("outflow outcome messages", () => {
  it("describes an expense without implying that stock changed", () => {
    const message = expenseOutcomeMessage("Transport", 2500);

    expect(message).toContain("Expense saved");
    expect(message).toContain("Transport");
    expect(message).toContain("2,500");
    expect(message).not.toMatch(/stock/i);
  });

  it("uses submitted delivery totals and explicitly describes the stock effect", () => {
    const message = deliveryOutcomeMessage(12.5, 18750);

    expect(message).toContain("Delivery saved");
    expect(message).toContain("12.5 units");
    expect(message).toContain("18,750");
    expect(message).toContain("Stock increased");
  });
});
