"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Menu, ChevronLeft } from "lucide-react";
import { useSideDrawer } from "@/components/ui/DrawerContext";
import { useAlertBadgeCount } from "@/features/alerts/use-alert-center";
import { hasAppBackHistory } from "@/lib/app-history";
import { useAppScreenHeader } from "./ScreenHeaderContext";
import { SyncStatusPill } from "./SyncStatusPill";

const TITLE_PATTERNS: readonly [string, string][] = [
  ["/pos", "Sell"],
  ["/products/new", "Add product"],
  ["/products/import", "Import products"],
  ["/more/import-catalog", "Import products"],
  ["/products", "Products"],
  ["/reports", "Reports"],
  ["/more", "More"],
  ["/settings/help", "Help & support"],
  ["/settings/sharing", "Sharing"],
  ["/settings/branches", "Branches"],
  ["/settings/business", "Business profile"],
  ["/settings/data/reconciliation", "Review saved changes"],
  ["/settings/data", "Backup & data"],
  ["/settings/sync-health", "Cloud backup"],
  ["/settings", "Settings"],
  ["/contacts", "Contacts & debtors"],
  ["/customers", "Contacts & debtors"],
  ["/sales", "Sales & receipts"],
  ["/stock-count", "Stock count"],
  ["/purchases/new", "Receive delivery"],
  ["/purchases/update-stock", "Adjust stock"],
  ["/purchases", "Restock history"],
  ["/expenses/new", "Record expense"],
  ["/expenses", "Expenses"],
  ["/alerts", "Alerts"],
  ["/close-day", "Close day"],
  ["/staff/new", "Add staff"],
  ["/staff/audit", "Audit log"],
  ["/staff", "Staff & access"],
  ["/profile", "Profile"],
  ["/admin", "Super admin"],
  ["/offline", "Offline mode"],
  ["/welcome", "First product"],
] as const;

const PARENT_FALLBACKS: readonly [string, string][] = [
  ["/products/", "/products"],
  ["/more/", "/more"],
  ["/purchases/", "/purchases"],
  ["/expenses/", "/expenses"],
  ["/sales/", "/sales"],
  ["/staff/", "/staff"],
  ["/settings/", "/settings"],
  ["/contacts/", "/contacts"],
  ["/customers/", "/contacts"],
] as const;

export function getPageTitle(pathname: string): string {
  if (!pathname || pathname === "/" || pathname === "/dashboard" || pathname === "/business" || pathname === "/work") {
    return "Dashboard";
  }
  const match = TITLE_PATTERNS.find(([pattern]) => pathname.includes(pattern));
  if (match) return match[1];

  const clean = pathname.replace(/^\/(business|work)\//, "").replace(/^\//, "").split("/")[0];
  if (!clean) return "Dashboard";
  return clean.charAt(0).toUpperCase() + clean.slice(1).replace(/-/g, " ");
}

const ROOT_DESTINATIONS = new Set([
  "/",
  "/dashboard",
  "/pos",
  "/products",
  "/reports",
  "/more",
  "/settings",
  "/business",
  "/work",
]);

function isSubPage(pathname: string): boolean {
  if (!pathname) return false;
  return !ROOT_DESTINATIONS.has(pathname);
}

/**
 * The app shell owns the page title and navigation action.
 * Unifies mobile navigation hierarchy and eliminates redundant secondary headers.
 */
export function TopStoreHeader() {
  const { openDrawer } = useSideDrawer();
  const pathname = usePathname();
  const router = useRouter();
  const alertCount = useAlertBadgeCount();
  const screen = useAppScreenHeader(pathname);
  const pageTitle = screen?.title ?? getPageTitle(pathname);
  const shellPrefix = pathname.match(/^\/(business|work)(?=\/|$)/)?.[0] ?? "";
  const route = pathname.slice(shellPrefix.length) || "/dashboard";
  const showBack = isSubPage(route) || Boolean(screen?.onBack);

  const handleBack = () => {
    if (screen?.onBack) {
      screen.onBack();
      return;
    }
    if (hasAppBackHistory()) {
      router.back();
      return;
    }
    const match = PARENT_FALLBACKS.find(([prefix]) => route.startsWith(prefix));
    const destination = screen?.fallbackHref ?? match?.[1] ?? "/dashboard";
    router.replace(shellPrefix && destination === "/dashboard" ? shellPrefix : destination);
  };

  return (
    <header
      className="safe-area-top relative z-40 flex w-full flex-col select-none bg-surface-container-low text-on-surface"
      role="banner"
      aria-label="Application header"
    >
      <div className="mx-auto flex min-h-[var(--touch-target-min)] w-full max-w-xl items-center gap-1 px-4 sm:px-6 md:max-w-2xl">
        {/* Left: Navigation Affordance (Back Chevron on subpages, Hamburger Drawer on root tabs) + Page Name */}
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {showBack ? (
            <button
              type="button"
              onClick={handleBack}
              aria-label="Go back"
              className="flex size-[var(--touch-target-min)] shrink-0 items-center justify-center rounded-full hover:bg-surface-container-high active:scale-95 focus-visible:outline-2 focus-visible:-outline-offset-2"
            >
              <ChevronLeft size={22} aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              onClick={openDrawer}
              aria-label="Open navigation menu"
              className="flex size-[var(--touch-target-min)] shrink-0 items-center justify-center rounded-full hover:bg-surface-container-high active:scale-95 focus-visible:outline-2 focus-visible:-outline-offset-2"
            >
              <Menu size={20} aria-hidden />
            </button>
          )}

          <h1
            className="min-w-0 wrap-anywhere text-base font-semibold leading-tight tracking-tight sm:text-lg"
            title={pageTitle}
          >
            {pageTitle}
          </h1>
        </div>
        <SyncStatusPill />
        <Link
          href={`${shellPrefix}/alerts`}
          aria-label={alertCount > 0 ? `Notifications, ${alertCount} unread` : "Notifications"}
          className="relative flex size-[var(--touch-target-min)] shrink-0 items-center justify-center rounded-full hover:bg-surface-container-high focus-visible:outline-2 focus-visible:-outline-offset-2"
        >
          <Bell size={21} aria-hidden />
          {alertCount > 0 && (
            <span aria-hidden className="pointer-events-none absolute end-0 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-container px-1 text-[length:var(--font-size-caption)] font-bold leading-none text-on-danger-container">
              {alertCount > 99 ? "99+" : alertCount}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
