/**
 * Routes whose screen shell and data are safe to use from the local Dexie
 * store. Everything else is treated as online-only while disconnected.
 */
export const OFFLINE_ROUTES = [
  "/dashboard",
  "/pos",
  "/products",
  "/sales",
  "/contacts",
  "/close-day",
  "/reports",
  "/settings/data",
] as const;

const OFFLINE_ROUTE_PREFIXES = ["/sales/", "/customers/"] as const;

/** Minimum shell needed for a cashier to reopen and sell. Warm this small set
 * first; the remaining offline routes wait until the app and sync engine are
 * idle so startup stays responsive on low-end phones. */
export const OFFLINE_BOOT_ROUTES = ["/dashboard", "/pos"] as const;

export const OFFLINE_WARM_ROUTES = [
  "/dashboard",
  "/pos",
  "/products",
  "/sales",
  "/contacts",
  "/close-day",
  "/reports",
  "/settings/data",
] as const;

export function isOfflineRoute(pathname: string): boolean {
  return OFFLINE_ROUTES.includes(pathname as (typeof OFFLINE_ROUTES)[number]) ||
    OFFLINE_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** These filters are rendered from local data after the document boots. */
export function offlineDocumentCacheKey(url: URL): string {
  const localKeys = url.pathname === "/sales" ? ["date", "branch", "own"]
    : url.pathname === "/products" ? ["filter"]
    : url.pathname === "/contacts" ? ["filter", "tab"] : [];
  return [...url.searchParams.keys()].every((key) => localKeys.includes(key)) ? url.pathname : url.pathname + url.search;
}
