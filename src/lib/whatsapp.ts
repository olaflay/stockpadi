/**
 * Nigerian phone number normalization and wa.me URL construction, used
 * anywhere the app shares to WhatsApp (close-day summary to the owner's own
 * number, a receipt or debt reminder to a customer's number). One helper so
 * no screen hand-rolls the URL differently. See docs/RESEARCH-AND-PLAN.md
 * Section 4.4 — the existing "Share on WhatsApp" button had no recipient at
 * all, dumping the user into WhatsApp's contact picker every time.
 */

/**
 * Accepts common local formats (0803..., 803..., +234803..., 234803...,
 * with spaces/dashes) and returns E.164 digits with no leading "+"
 * (wa.me's expected format), or null if it doesn't look like a valid
 * Nigerian mobile number.
 */
export function normalizeNigerianPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/[^\d]/g, "");

  if (digits.startsWith("234") && digits.length === 13) {
    return digits;
  }
  if (digits.startsWith("0") && digits.length === 11) {
    return `234${digits.slice(1)}`;
  }
  if (digits.length === 10) {
    return `234${digits}`;
  }
  return null;
}

/**
 * Builds a wa.me link. Falls back to WhatsApp's own contact picker
 * (no recipient in the URL) when the number is missing or doesn't
 * normalize — the same fallback the app already used everywhere, kept
 * intentional and explicit rather than silently failing.
 */
export function buildWhatsAppUrl(phone: string | null | undefined, message: string): string {
  const normalized = normalizeNigerianPhone(phone);
  const text = encodeURIComponent(message);
  return normalized ? `https://wa.me/${normalized}?text=${text}` : `https://wa.me/?text=${text}`;
}
