export type ContactKind = "all" | "debtors" | "customers" | "suppliers";

export interface ContactRow {
  /** Unique composite key in UI: `customer:${id}` or `supplier:${id}` or `merged:${customerId}:${supplierId}` */
  id: string;
  customerId?: string;
  supplierId?: string;
  name: string;
  phone: string | null;
  kinds: ("customer" | "supplier")[];
  balance: number;
  debtAgeDays?: number;
  updatedAt?: string;
}

export interface ContactCounts {
  all: number;
  debtors: number;
  customers: number;
  suppliers: number;
}

/**
 * Computes live counts across contact categories.
 * A debtor is any customer with an outstanding credit balance > 0.
 */
export function computeCounts(rows: ContactRow[]): ContactCounts {
  return {
    all: rows.length,
    debtors: rows.filter((r) => r.balance > 0).length,
    customers: rows.filter((r) => r.kinds.includes("customer")).length,
    suppliers: rows.filter((r) => r.kinds.includes("supplier")).length,
  };
}

/**
 * Filters contacts by kind (chip selection) and search query (name or phone substring match).
 * Sorting:
 * - Debtors: sorted by balance descending (highest debt first).
 * - Other filters: sorted alphabetically by name.
 */
export function filterContacts(
  rows: ContactRow[],
  kind: ContactKind,
  query: string
): ContactRow[] {
  const normalizedQuery = query.trim().toLowerCase();

  const filtered = rows.filter((row) => {
    // Category match
    if (kind === "debtors" && row.balance <= 0) return false;
    if (kind === "customers" && !row.kinds.includes("customer")) return false;
    if (kind === "suppliers" && !row.kinds.includes("supplier")) return false;

    // Search query match
    if (normalizedQuery) {
      const matchName = row.name.toLowerCase().includes(normalizedQuery);
      const matchPhone = row.phone ? row.phone.toLowerCase().includes(normalizedQuery) : false;
      if (!matchName && !matchPhone) return false;
    }

    return true;
  });

  // Sort
  return filtered.sort((a, b) => {
    if (kind === "debtors") {
      // Balance descending
      if (b.balance !== a.balance) return b.balance - a.balance;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}
