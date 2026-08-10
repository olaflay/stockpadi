import { describe, expect, it } from "vitest";
import { hashPin, verifyPin } from "@/lib/pin-hash";

describe("pin-hash", () => {
  it("verifies a correct PIN against its own hash", async () => {
    const stored = await hashPin("1234");
    expect(await verifyPin("1234", stored)).toBe(true);
  });

  it("rejects an incorrect PIN", async () => {
    const stored = await hashPin("1234");
    expect(await verifyPin("9999", stored)).toBe(false);
  });

  it("produces a different salt (and hash) on each call for the same PIN", async () => {
    const first = await hashPin("1234");
    const second = await hashPin("1234");
    expect(first).not.toBe(second);
    expect(await verifyPin("1234", first)).toBe(true);
    expect(await verifyPin("1234", second)).toBe(true);
  });

  it("rejects when there is no stored hash", async () => {
    expect(await verifyPin("1234", null)).toBe(false);
  });
});
