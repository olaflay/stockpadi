"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Bell } from "lucide-react";
import { useSideDrawer } from "@/components/ui/DrawerContext";
import { SyncIndicator } from "@/components/ui/SyncIndicator";
import { useAlertBadgeCount } from "@/features/alerts/use-alert-center";

export function getPageTitle(pathname: string): string {
  if (!pathname || pathname === "/" || pathname === "/dashboard" || pathname === "/business" || pathname === "/work") {
    return "Dashboard";
  }
  if (pathname.includes("/pos")) return "Sell";
  if (pathname.includes("/products/new")) return "Add Product";
  if (pathname.includes("/products")) return "Products";
  if (pathname.includes("/reports")) return "Reports";
  if (pathname.includes("/settings/help")) return "Help & Support";
  if (pathname.includes("/settings/sharing")) return "Sharing";
  if (pathname.includes("/settings/branches")) return "Branches";
  if (pathname.includes("/settings")) return "Settings";
  if (pathname.includes("/customers")) return "Customers";
  if (pathname.includes("/sales")) return "Sales and receipts";
  if (pathname.includes("/stock-count")) return "Stock count";
  if (pathname.includes("/purchases/new") || pathname.includes("/purchases/update-stock")) return "Restock";
  if (pathname.includes("/purchases")) return "Purchases and restock";
  if (pathname.includes("/expenses/new")) return "Record expense";
  if (pathname.includes("/expenses")) return "Expenses";
  if (pathname.includes("/alerts")) return "Alerts";
  if (pathname.includes("/close-day")) return "Close day";
  if (pathname.includes("/staff/new")) return "Add staff";
  if (pathname.includes("/staff/audit")) return "Audit log";
  if (pathname.includes("/staff")) return "Staff and access";
  if (pathname.includes("/profile")) return "Profile";
  if (pathname.includes("/admin")) return "Super admin";
  if (pathname.includes("/offline")) return "Offline mode";
  if (pathname.includes("/welcome")) return "First product";

  const clean = pathname.replace(/^\/(business|work)\//, "").replace(/^\//, "").split("/")[0];
  if (!clean) return "Dashboard";
  return clean.charAt(0).toUpperCase() + clean.slice(1).replace(/-/g, " ");
}

/**
 * TopStoreHeader — Authoritative green top app bar.
 * Houses the drawer hamburger menu button, the dynamic page name, and the sync indicator.
 * Completely removes the white stroke border and frees up vertical screen space.
 */
export function TopStoreHeader() {
  const { openDrawer } = useSideDrawer();
  const pathname = usePathname();
  const alertCount = useAlertBadgeCount();
  const pageTitle = getPageTitle(pathname);

  return (
    <header
      className="sticky top-0 left-0 right-0 z-40 flex w-full flex-col shadow-sm select-none gpu-layer before:content-[''] before:absolute before:bottom-full before:inset-x-0 before:h-32 before:bg-[var(--brand-accent-configured,var(--color-brand-accent,#0a6e4d))] before:pointer-events-none"
      style={{
        backgroundColor: "var(--brand-accent-configured, var(--color-brand-accent, #0a6e4d))",
        color: "var(--color-brand-accent-contrast, #ffffff)",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
      role="banner"
      aria-label="Application header"
    >
      <div className="w-full flex h-13 sm:h-14 items-center justify-between px-4 sm:px-6 max-w-xl md:max-w-2xl mx-auto">
        {/* Left: Hamburger Drawer Trigger + Page Name */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            type="button"
            onClick={openDrawer}
            aria-label="Open navigation menu"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/10 active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            <Menu size={22} aria-hidden />
          </button>

          <h1
            className="truncate text-lg sm:text-xl font-bold tracking-tight text-white leading-tight"
            title={pageTitle}
          >
            {pageTitle}
          </h1>
        </div>

        {/* Right: Sync Indicator & Alerts */}
        <div className="flex items-center gap-2 shrink-0">
          <SyncIndicator compact variant="contrast" />
          {alertCount > 0 && (
            <Link
              href="/alerts"
              aria-label={`${alertCount} unread alerts`}
              className="relative flex h-8 w-8 items-center justify-center rounded-full text-white/90 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Bell size={17} aria-hidden />
              <span
                className="absolute top-1 right-1 h-2 w-2 rounded-full bg-[var(--color-stock-alert)] ring-1.5 ring-[var(--brand-accent-configured,#0a6e4d)]"
                aria-hidden
              />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
