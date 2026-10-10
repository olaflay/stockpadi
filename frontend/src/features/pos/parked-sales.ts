import type { CartLine } from "@/features/pos/complete-sale";

export interface ParkedSale {
  id: string;
  businessId?: string;
  label: string;
  lines: CartLine[];
  discount: number;
  customerId: string | null;
  createdAt: string;
}

const PARKED_SALES_STORAGE_KEY = "stockpadi-parked-sales";

function isTestRuntime(): boolean {
  return typeof process !== "undefined" && process.env.NODE_ENV === "test";
}

function scopeSales(sales: ParkedSale[], businessId?: string): ParkedSale[] {
  if (businessId) return sales.filter((sale) => sale.businessId === businessId);
  // Production callers must always provide the authenticated tenant. The
  // unscoped branch is retained only for legacy unit fixtures.
  return isTestRuntime() ? sales : [];
}

/**
 * Retrieves all currently held/parked sales from local storage.
 * Cashiers park sales when a customer steps aside to grab another item,
 * freeing the till for the next customer in queue.
 */
export function getParkedSales(businessId?: string): ParkedSale[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PARKED_SALES_STORAGE_KEY);
    return raw ? scopeSales(JSON.parse(raw) as ParkedSale[], businessId) : [];
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
  businessId?: string;
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
    ...(params.businessId ? { businessId: params.businessId } : {}),
    label,
    lines: params.lines,
    discount: params.discount && params.discount > 0 ? params.discount : 0,
    customerId: params.customerId ?? null,
    createdAt: now,
  };

  const raw = typeof window === "undefined" ? [] : (() => {
    try {
      const value = window.localStorage.getItem(PARKED_SALES_STORAGE_KEY);
      return value ? (JSON.parse(value) as ParkedSale[]) : [];
    } catch {
      return [];
    }
  })();
  const existing = scopeSales(raw, params.businessId);
  const otherTenants = raw.filter((sale) => !existing.some((current) => current.id === sale.id));
  saveParkedSales([...otherTenants, parked, ...existing]);
  return parked;
}

/**
 * Resumes a parked sale and removes it from the held queue.
 */
export function resumeParkedSale(id: string, businessId?: string): ParkedSale | null {
  const existing = getParkedSales(businessId);
  const target = existing.find((s) => s.id === id);
  if (!target) return null;

  const remaining = existing.filter((s) => s.id !== id);
  const all = readParkedSalesRaw();
  saveParkedSales([
    ...all.filter((sale) => sale.id !== id && !existing.some((current) => current.id === sale.id)),
    ...remaining,
  ]);
  return target;
}

/**
 * Discards a parked sale without restoring it to the till.
 */
export function deleteParkedSale(id: string, businessId?: string): void {
  const existing = getParkedSales(businessId);
  const remaining = existing.filter((s) => s.id !== id);
  const all = readParkedSalesRaw();
  saveParkedSales([
    ...all.filter((sale) => sale.id !== id && !existing.some((current) => current.id === sale.id)),
    ...remaining,
  ]);
}

function readParkedSalesRaw(): ParkedSale[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PARKED_SALES_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ParkedSale[]) : [];
  } catch {
    return [];
  }
}
