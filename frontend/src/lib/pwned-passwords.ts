/**
 * HaveIBeenPwned client using the k-anonymity model.
 *
 * Only the first 5 characters of the SHA-1 hash are sent to the API.
 * The response contains all matching suffixes — the full hash never
 * leaves the browser. This is the same approach Supabase uses server-side
 * for leaked-password detection (which requires the Pro plan).
 *
 * Reference: https://haveibeenpwned.com/API/v3#PwnedPasswords
 */

const HIBP_API = "https://api.pwnedpasswords.com/range";

async function sha1hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/**
 * Returns the number of times this password has appeared in data breaches.
 * Returns 0 if the password has never been breached.
 */
export async function pwnedPasswordCount(password: string): Promise<number> {
  const hash = await sha1hex(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  const res = await fetch(`${HIBP_API}/${prefix}`, {
    headers: { "Add-Padding": "true" },
  });

  if (!res.ok) {
    throw new Error(`HIBP API returned ${res.status}`);
  }

  const text = await res.text();
  const lines = text.split("\n");

  for (const line of lines) {
    const [hashSuffix, count] = line.split(":");
    if (hashSuffix.trim() === suffix) {
      return parseInt(count.trim(), 10);
    }
  }

  return 0;
}

/**
 * Returns true if the password has been found in known data breaches.
 * Silently returns false on network errors so signup is never blocked
 * by a third-party API outage.
 */
export async function isPasswordPwned(password: string): Promise<boolean> {
  try {
    const count = await pwnedPasswordCount(password);
    return count > 0;
  } catch {
    return false;
  }
}
