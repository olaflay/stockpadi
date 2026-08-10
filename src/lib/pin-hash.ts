/**
 * PBKDF2-SHA256 hashing for the 4-digit daily PIN, entirely via the
 * browser-native Web Crypto API (no WASM dependency). PRD Section 10.3
 * requires the PIN to validate fully offline against a locally cached,
 * salted hash — this is that hash. Stored as a single string,
 * "<saltHex>:<hashHex>", so no schema change was needed on the server's
 * existing `users.pin_hash` column.
 */

const PBKDF2_ITERATIONS = 100_000;
const HASH_BITS = 256;

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function deriveHash(pin: string, salt: Uint8Array): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    HASH_BITS
  );
  return toHex(bits);
}

/** Hashes a new PIN with a fresh random salt. Returns the combined string to store as `pinHash`. */
export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hashHex = await deriveHash(pin, salt);
  return `${toHex(salt.buffer)}:${hashHex}`;
}

/** Verifies a PIN entry against a stored "<saltHex>:<hashHex>" value, fully offline. */
export async function verifyPin(pin: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [saltHex, expectedHashHex] = stored.split(":");
  if (!saltHex || !expectedHashHex) return false;
  const candidateHashHex = await deriveHash(pin, fromHex(saltHex));
  return candidateHashHex === expectedHashHex;
}
