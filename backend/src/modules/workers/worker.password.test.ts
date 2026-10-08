import { describe, expect, it } from "vitest";
import { generatePassword } from "./worker.password.js";

describe("worker password generation", () => {
  it("creates a shorter password that still meets the shared character policy", () => {
    const password = generatePassword("Any business name");

    expect(password).toHaveLength(12);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/\d/);
    expect(password).toMatch(/[^A-Za-z0-9]/);
  });
});
