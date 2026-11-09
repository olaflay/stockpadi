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
