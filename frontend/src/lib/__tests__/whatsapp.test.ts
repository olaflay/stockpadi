import { describe, expect, it } from "vitest";
import { buildWhatsAppUrl, DEFAULT_OWING_MESSAGE_TEMPLATE, normalizeNigerianPhone, renderOwingMessage } from "@/lib/whatsapp";

describe("normalizeNigerianPhone", () => {
  it("converts a leading-zero local number to E.164 digits", () => {
    expect(normalizeNigerianPhone("08031234567")).toBe("2348031234567");
  });

  it("strips spaces and dashes before normalizing", () => {
    expect(normalizeNigerianPhone("0803 123 4567")).toBe("2348031234567");
    expect(normalizeNigerianPhone("0803-123-4567")).toBe("2348031234567");
  });

  it("accepts an already-international +234 number", () => {
    expect(normalizeNigerianPhone("+2348031234567")).toBe("2348031234567");
  });

  it("accepts a 10-digit number with no leading zero", () => {
    expect(normalizeNigerianPhone("8031234567")).toBe("2348031234567");
  });

  it("returns null for empty, missing, or unrecognizable input", () => {
    expect(normalizeNigerianPhone(null)).toBeNull();
    expect(normalizeNigerianPhone(undefined)).toBeNull();
    expect(normalizeNigerianPhone("")).toBeNull();
    expect(normalizeNigerianPhone("123")).toBeNull();
  });
});

describe("buildWhatsAppUrl", () => {
  it("builds a direct link to a normalized number", () => {
    expect(buildWhatsAppUrl("08031234567", "Hello")).toBe("https://wa.me/2348031234567?text=Hello");
  });

  it("falls back to the contact picker when the number is missing or invalid", () => {
    expect(buildWhatsAppUrl(null, "Hello")).toBe("https://wa.me/?text=Hello");
    expect(buildWhatsAppUrl("not a number", "Hello")).toBe("https://wa.me/?text=Hello");
  });

  it("URL-encodes the message", () => {
    expect(buildWhatsAppUrl(null, "Sales: ₦1,000")).toBe(`https://wa.me/?text=${encodeURIComponent("Sales: ₦1,000")}`);
  });
});

describe("renderOwingMessage", () => {
  it("uses one clear default and fills only the debtor-specific values", () => {
    const message = renderOwingMessage(undefined, {
      customerName: "Ada",
      businessName: "Configured shop",
      amountOwed: "₦12,500",
    });
    expect(DEFAULT_OWING_MESSAGE_TEMPLATE).toContain("{{amountOwed}}");
    expect(message).toContain("Ada");
    expect(message).toContain("Configured shop");
    expect(message).toContain("₦12,500");
    expect(message).toContain("current outstanding balance");
  });
});
