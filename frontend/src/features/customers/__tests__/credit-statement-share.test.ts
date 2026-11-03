import { describe, expect, it } from "vitest";
import { creditStatementFileName } from "../credit-statement-share";

describe("credit statement sharing", () => {
  it("uses debt-specific, portable export names", () => {
    expect(creditStatementFileName("pdf")).toBe("debt_statement.pdf");
    expect(creditStatementFileName("jpg")).toBe("debt_statement.jpg");
  });
});
