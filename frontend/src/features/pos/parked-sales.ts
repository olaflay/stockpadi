import type { CartLine } from "@/features/pos/complete-sale";

export interface ParkedSale {
  id: string;
  label: string;
  lines: CartLine[];
  discount: number;
  customerId: string | null;
  createdAt: string;
}

const PARKED_SALES_STORAGE_KEY = "stockpadi-parked-sales";

/**
 * Retrieves all currently held/parked sales from local storage.
 * Cashiers park sales when a customer steps aside to grab another item,
 * freeing the till for the next customer in queue.
 */
export function getParkedSales(): ParkedSale[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PARKED_SALES_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ParkedSale[]) : [];
  } catch {
    return [];
  }
}

export function saveParkedSales(sales: ParkedSale[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PARKED_SALES_STORAGE_KEY, JSON.stringify(sales));
  } catch {
    // Fail silently if localStorage quota is exceeded or unavailable in private browsing
  }
}

/**
 * Holds/parks the active cart locally so the cashier can proceed with another sale.
 */
export function parkSale(params: {
  lines: CartLine[];
  discount?: number;
  customerId?: string | null;
  label?: string;
}): ParkedSale {
  if (!params.lines || params.lines.length === 0) {
    throw new Error("Cannot park an empty cart.");
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const label = params.label?.trim() || `Parked at ${timeStr}`;

  const parked: ParkedSale = {
    id,
    label,
    lines: params.lines,
    discount: params.discount && params.discount > 0 ? params.discount : 0,
    customerId: params.customerId ?? null,
    createdAt: now,
  };

  const existing = getParkedSales();
  saveParkedSales([parked, ...existing]);
  return parked;
}

/**
 * Resumes a parked sale and removes it from the held queue.
 */
export function resumeParkedSale(id: string): ParkedSale | null {
  const existing = getParkedSales();
  const target = existing.find((s) => s.id === id);
  if (!target) return null;

  const remaining = existing.filter((s) => s.id !== id);
  saveParkedSales(remaining);
  return target;
}

/**
 * Discards a parked sale without restoring it to the till.
 */
export function deleteParkedSale(id: string): void {
  const existing = getParkedSales();
  const remaining = existing.filter((s) => s.id !== id);
  saveParkedSales(remaining);
}
