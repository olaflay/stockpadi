const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/**
 * Short enough to share verbally, while the fixed prefix keeps every output
 * compliant with the shared uppercase/lowercase/number/symbol policy.
 */
export function generatePassword(_business: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const randomPart = Array.from(bytes, (byte) => PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]).join("");
  return `Aa7!${randomPart}`;
}
