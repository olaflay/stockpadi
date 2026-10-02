import { normalizeNigerianPhone } from "@/lib/whatsapp";

/**
 * Normalizes phone inputs for storage and search across Contacts Hub.
 * Converts local Nigerian numbers (e.g. 08031234567) to international E.164 without '+' (e.g. 2348031234567).
 * If the input is not a recognized Nigerian format, it strips non-digit characters as a fallback.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const cleaned = input.trim();
  if (!cleaned) return null;

  const nigerianNormalized = normalizeNigerianPhone(cleaned);
  if (nigerianNormalized) {
    return nigerianNormalized;
  }

  const digits = cleaned.replace(/[^\d+]/g, "");
  return digits.length >= 7 ? digits : null;
}

/**
 * Formats a phone number for user-friendly display (e.g. +234 803 123 4567 or 0803 123 4567).
 */
export function formatDisplayPhone(input: string | null | undefined): string {
  if (!input) return "";
  const trimmed = input.trim();
  const digits = trimmed.replace(/[^\d]/g, "");

  if (digits.startsWith("234") && digits.length === 13) {
    return `+234 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  if (digits.startsWith("0") && digits.length === 11) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  return trimmed;
}
