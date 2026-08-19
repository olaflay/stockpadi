export function generatePassword(business: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const prefix = business.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "Store";
  return `SP-${prefix}-${Array.from(bytes, (byte) => (byte % 36).toString(36)).join("").toUpperCase()}!`;
}
