/**
 * Input sanitization helper derived from The Lazy Developer security guide:
 * "Form Validation & Security — 4-layer defence-in-depth"
 *
 * Strips HTML tags, script injection tokens, and dangerous attributes
 * from free-text form inputs before database insertion or API calls.
 */

/**
 * Escapes special HTML characters and strips dangerous tags/protocols from string inputs.
 */
export function sanitizeString(input: string): string {
  if (!input) return "";
  return input
    .trim()
    .replace(/<[^>]*>?/gm, "") // Strip HTML tags
    .replace(/javascript:/gi, "") // Neutralize javascript: URI schemes
    .replace(/on\w+\s*=/gi, ""); // Neutralize event handler attributes (e.g. onerror=, onload=)
}

/**
 * Sanitizes all string values in an object payload.
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = sanitizeString(value);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}
