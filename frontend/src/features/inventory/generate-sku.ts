/**
 * The SKU auto-generation used by both the Add Product form and CSV import.
 * One shared implementation so the two flows can never drift apart ("just
 * like the add products flow"). Mirrors the prefix logic live in the form:
 * first 4 alphanumeric characters of the name, uppercased, a dash, and a
 * 4-digit tail. `ITEM-1234` when the name has no usable prefix.
 */
export function generateFallbackSku(name: string): string {
  const prefix = name.trim().replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase() || "ITEM";
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${rand}`;
}

/**
 * Import-specific: a fallback SKU that is guaranteed not to collide with any
 * SKU already in `taken` (existing products plus already-generated rows in the
 * same file). Re-rolls until free, capped so a pathological repeated name
 * still resolves instead of looping forever.
 */
export function generateUniqueFallbackSku(name: string, taken: Set<string>): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    const candidate = generateFallbackSku(name);
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  const prefix = name.trim().replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase() || "ITEM";
  return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}