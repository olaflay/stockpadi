const LAST_CATEGORY_STORAGE_KEY = "stockpadi:last-category-id";
const RECENT_CATEGORIES_STORAGE_KEY = "stockpadi:recent-category-ids";
const MAX_RECENT_CATEGORIES = 8;

/**
 * Remembers which categories were used recently, most-recent-first — so
 * "Add product" and the POS category chips can surface them first instead
 * of an alphabetical or seed-order list. Same localStorage precedent as
 * src/features/auth/device-id.ts.
 */
export function getLastCategoryId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LAST_CATEGORY_STORAGE_KEY);
}

export function getRecentCategoryIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_CATEGORIES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** Call after a category is used (a product saved with it, or a sale filtered by it). */
export function markCategoryUsed(categoryId: string): void {
  if (typeof window === "undefined" || !categoryId) return;
  window.localStorage.setItem(LAST_CATEGORY_STORAGE_KEY, categoryId);
  const current = getRecentCategoryIds().filter((id) => id !== categoryId);
  const next = [categoryId, ...current].slice(0, MAX_RECENT_CATEGORIES);
  window.localStorage.setItem(RECENT_CATEGORIES_STORAGE_KEY, JSON.stringify(next));
}
