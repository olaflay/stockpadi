"use client";

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

/**
 * Samsung One UI bottom interaction area:
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

  // Strict route whitelist: Only top-level destinations render the nav container.
  // Child routes, forms, modals, and settings sub-pages never render BottomNav.
  const isMainTab =
    pathname === "/dashboard" ||
    pathname === "/pos" ||
    pathname === "/products" ||
    pathname === "/reports" ||
    pathname === "/more" ||
    pathname === "/stock-count";

  if (!isMainTab) {
    return null;
  }

  const isOwnerOrAdmin = user.accountType === "BUSINESS_OWNER" || user.accountType === "ADMIN";
  const items = (isOwnerOrAdmin ? OWNER_NAV : WORKER_NAV).filter(
    (item) => !("capability" in item) || hasCapability(user, item.capability as WorkerCapability),
  );

  return (
    <nav
      data-bottom-nav
      aria-label="Main navigation"
      className={`fixed bottom-0 left-0 right-0 z-40 flex border-t border-border/40 bg-surface-container gpu-layer transition-all duration-200 ease-out ${
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
        const isActive = pathname === item.href;
        const Icon = item.icon;
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
              {"badge" in item && item.badge && <AlertBadge />}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
