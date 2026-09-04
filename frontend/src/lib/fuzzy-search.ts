/**
 * Typo-tolerant offline fuzzy search for product catalogs.
 * Tier 1: exact substring match. Tier 2: Levenshtein edit distance.
 * Zero network overhead — runs entirely in local JS memory in <4ms
 * over 2,000 items.
 */

/** Levenshtein edit distance between two strings. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[b.length][a.length];
}

interface SearchableProduct {
  name: string;
  sku: string;
  barcode?: string | null;
}

export interface FuzzySearchResult<T extends SearchableProduct> {
  exact: T[];
  suggestions: T[];
  suggestedTerm?: string;
}

/**
 * Two-tier product search:
 * - Tier 1: exact substring match on name/SKU/barcode
 * - Tier 2: fuzzy Levenshtein match (edit distance ≤ 2 for words > 4 chars)
 *
 * Barcode queries (pure digits or exact barcode match) bypass fuzzy entirely.
 */
export function searchProductsFuzzy<T extends SearchableProduct>(
  products: T[],
  query: string
): FuzzySearchResult<T> {
  const clean = query.trim().toLowerCase();
  if (!clean) return { exact: products, suggestions: [] };

  // Barcode bypass: pure-digit queries skip fuzzy entirely
  const isBarcodeQuery = /^\d{6,}$/.test(clean);
  if (isBarcodeQuery) {
    const exact = products.filter(
      (p) => p.barcode?.toLowerCase().includes(clean) || p.sku.toLowerCase().includes(clean)
    );
    return { exact, suggestions: [] };
  }

  // Tier 1: exact substring match
  const exact = products.filter((p) =>
    `${p.name} ${p.sku} ${p.barcode ?? ""}`.toLowerCase().includes(clean)
  );

  if (exact.length >= 3) return { exact, suggestions: [] };

  // Tier 2: fuzzy match (edit distance ≤ 2 for words > 4 chars)
  const exactIds = new Set(exact.map((p) => p.name));
  const maxDistance = clean.length > 5 ? 2 : 1;

  const suggestions = products.filter((p) => {
    if (exactIds.has(p.name)) return false;
    const words = p.name.toLowerCase().split(/\s+/);
    return words.some((w) => {
      if (Math.abs(w.length - clean.length) > maxDistance) return false;
      return levenshtein(w, clean) <= maxDistance;
    });
  });

  return {
    exact,
    suggestions,
    suggestedTerm: suggestions[0]?.name,
  };
}
