"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Receipt,
  BarChart3,
  MoreHorizontal,
  ClipboardCheck,
} from "lucide-react";

import { useCurrentUser } from "@/features/auth/use-current-user";
import { hasCapability } from "@/features/auth/authorization";
import type { WorkerCapability } from "@/features/auth/authorization";
import { AlertBadge } from "@/components/ui/AlertBadge";
import { useNavigation } from "@/components/ui/NavigationContext";
import { MoreSheetModal } from "@/components/ui/MoreSheetModal";

const SECONDARY_ROUTES_PREFIXES = [
  "/more",
  "/contacts",
  "/customers",
  "/sales",
  "/expenses",
  "/purchases",
  "/settings",
  "/profile",
  "/staff",
  "/alerts",
  "/products/import",
];

const DELICATE_FORM_FLOWS = [
  "/products/new",
  "/expenses/new",
  "/purchases/new",
  "/staff/new",
  "/close-day",
  "/welcome",
  "/onboarding",
];

export function isDelicateFormRoute(pathname: string): boolean {
  if (!pathname) return false;
  return DELICATE_FORM_FLOWS.some((flow) => pathname === flow || pathname.startsWith(`${flow}/`));
}

export function isSecondaryDestination(pathname: string): boolean {
  if (!pathname) return false;
  return SECONDARY_ROUTES_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * Samsung One UI & M3 bottom interaction area:
 * Exactly 5 buttons keep touch targets roomy and thumb-reachable on mobile.
 * Adapts dynamically:
 * - Business Owner & Admin: Dashboard | Sell | Products | Reports | More
 * - Worker: Dashboard | Sell | Products | Stock | More
 */
const OWNER_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, badge: true },
  { href: "/pos", label: "Sell", icon: Receipt, capability: "POS_SELL" as const },
  { href: "/products", label: "Products", icon: Package, capability: "VIEW_PRODUCTS" as const },
  { href: "/reports", label: "Reports", icon: BarChart3, capability: "VIEW_REPORTS" as const },
  { href: "/more", label: "More", icon: MoreHorizontal },
] as const;

const WORKER_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, badge: true },
  { href: "/pos", label: "Sell", icon: Receipt, capability: "POS_SELL" as const },
  { href: "/products", label: "Products", icon: Package, capability: "VIEW_PRODUCTS" as const },
  { href: "/stock-count", label: "Stock", icon: ClipboardCheck, capability: "SUBMIT_STOCK_COUNT" as const },
  { href: "/more", label: "More", icon: MoreHorizontal },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const user = useCurrentUser();
  const { isNavVisible } = useNavigation();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  // Delicate exclusion: Hide BottomNav ONLY on full-screen creation forms & onboarding wizards
  // where sticky save buttons and inputs own the viewport. Shows on all other app pages.
  if (isDelicateFormRoute(pathname)) {
    return null;
  }

  const isOwnerOrAdmin = user.accountType === "BUSINESS_OWNER" || user.accountType === "ADMIN";
  const items = (isOwnerOrAdmin ? OWNER_NAV : WORKER_NAV).filter(
    (item) => !("capability" in item) || hasCapability(user, item.capability as WorkerCapability),
  );
  const isSecondary = isSecondaryDestination(pathname);

  return (
    <>
      <nav
        data-bottom-nav
        aria-label="Main navigation"
        className={`fixed bottom-0 left-0 right-0 z-50 flex border-t border-border/40 bg-surface-container gpu-layer transition-all duration-200 ease-out ${
          isNavVisible ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 pointer-events-none"
        }`}
        style={{
          paddingBottom: "max(0.65rem, calc(env(safe-area-inset-bottom, 0px) + 0.35rem))",
          willChange: "transform, opacity",
        }}
      >
        {/* Downward background extension: permanently blankets the chin and overscroll area behind the home indicator */}
        <div
          aria-hidden
          className="absolute top-full inset-x-0 h-32 bg-surface-container pointer-events-none"
        />
        {items.map((item) => {
          const isMore = item.href === "/more";
          // M3 guideline: When More modal is open, navigation is NOT in state until user picks a page.
          let isActive = false;
          if (!isMoreOpen) {
            if (isMore) {
              isActive = isSecondary;
            } else if (item.href === "/dashboard") {
              isActive = pathname === "/dashboard";
            } else {
              isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            }
          }
          const Icon = item.icon;

          if (isMore) {
            return (
              <button
                key={item.href}
                type="button"
                id={`tour-nav-${item.label.toLowerCase()}`}
                onClick={() => setIsMoreOpen((prev) => !prev)}
                className={`flex min-h-[var(--touch-target-min)] flex-1 flex-col items-center justify-center gap-1 py-1.5 text-[length:var(--font-size-caption)] transition-colors duration-[var(--motion-duration-short)] ${
                  isActive ? "font-semibold text-on-surface" : "text-on-surface-muted"
                }`}
                aria-expanded={isMoreOpen}
                aria-label="Open more options menu"
              >
                <span
                  className={`relative flex h-8 w-16 items-center justify-center rounded-full transition-all duration-[var(--motion-duration-short)] ${
                    isActive ? "bg-brand-container text-on-brand-container" : "text-on-surface-muted"
                  }`}
                >
                  <Icon size={22} strokeWidth={isActive ? 2.4 : 1.8} aria-hidden />
                  {"badge" in item && Boolean(item.badge) ? <AlertBadge /> : null}
                </span>
                {item.label}
              </button>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              id={`tour-nav-${item.label.toLowerCase()}`}
              prefetch={true}
              className={`flex min-h-[var(--touch-target-min)] flex-1 flex-col items-center justify-center gap-1 py-1.5 text-[length:var(--font-size-caption)] transition-colors duration-[var(--motion-duration-short)] ${
                isActive ? "font-semibold text-on-surface" : "text-on-surface-muted"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <span
                className={`relative flex h-8 w-16 items-center justify-center rounded-full transition-all duration-[var(--motion-duration-short)] ${
                  isActive ? "bg-brand-container text-on-brand-container" : "text-on-surface-muted"
                }`}
              >
                <Icon size={22} strokeWidth={isActive ? 2.4 : 1.8} aria-hidden />
                {"badge" in item && Boolean(item.badge) ? <AlertBadge /> : null}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* More Modal Overlay */}
      {isMoreOpen && (
        <MoreSheetModal
          isOpen={isMoreOpen}
          onClose={() => setIsMoreOpen(false)}
          activePath={pathname}
        />
      )}
    </>
  );
}
