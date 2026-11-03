/**
 * Routes whose screen shell and data are safe to use from the local Dexie
 * store. Everything else is treated as online-only while disconnected.
 */
export const OFFLINE_ROUTES = [
  "/dashboard",
  "/pos",
  "/products",
  "/products/new",
  "/products/import",
  "/sales",
  "/contacts",
  "/expenses",
  "/expenses/new",
  "/purchases",
  "/purchases/new",
  "/purchases/update-stock",
  "/stock-count",
  "/close-day",
  "/reports",
  "/more",
  "/profile",
  "/settings/data",
  "/settings/sync-health",
] as const;

export const OFFLINE_WARM_ROUTES = [
  "/dashboard",
  "/pos",
  "/products",
  "/products/new",
  "/products/import",
  "/sales",
  "/contacts",
  "/expenses",
  "/expenses/new",
  "/purchases",
  "/purchases/new",
  "/purchases/update-stock",
  "/stock-count",
  "/close-day",
  "/reports",
  "/more",
  "/profile",
  "/settings/data",
  "/settings/sync-health",
] as const;

export function isOfflineRoute(pathname: string): boolean {
  return OFFLINE_ROUTES.includes(pathname as (typeof OFFLINE_ROUTES)[number]);
}
