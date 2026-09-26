"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Receipt,
  BarChart3,
  Settings,
  ClipboardCheck,
} from "lucide-react";

import { useCurrentUser } from "@/features/auth/use-current-user";
import { hasCapability } from "@/features/auth/authorization";
import type { WorkerCapability } from "@/features/auth/authorization";
import { AlertBadge } from "@/components/ui/AlertBadge";

/**
 * Samsung One UI bottom interaction area:
 * Exactly 5 buttons keep touch targets roomy and thumb-reachable on mobile.
 * Adapts dynamically:
 * - Business Owner & Admin: Dashboard | Sell | Products | Reports | Settings
 * - Worker: Dashboard | Sell | Products | Stock | Settings
 */
const OWNER_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, badge: true },
  { href: "/pos", label: "Sell", icon: Receipt, capability: "POS_SELL" as const },
  { href: "/products", label: "Products", icon: Package, capability: "VIEW_PRODUCTS" as const },
  { href: "/reports", label: "Reports", icon: BarChart3, capability: "VIEW_REPORTS" as const },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

const WORKER_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, badge: true },
  { href: "/pos", label: "Sell", icon: Receipt, capability: "POS_SELL" as const },
  { href: "/products", label: "Products", icon: Package, capability: "VIEW_PRODUCTS" as const },
  { href: "/stock-count", label: "Stock", icon: ClipboardCheck, capability: "SUBMIT_STOCK_COUNT" as const },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const user = useCurrentUser();

  const isOwnerOrAdmin = user.accountType === "BUSINESS_OWNER" || user.accountType === "ADMIN";
  const items = (isOwnerOrAdmin ? OWNER_NAV : WORKER_NAV).filter(
    (item) => !("capability" in item) || hasCapability(user, item.capability as WorkerCapability),
  );

  return (
    <nav
      aria-label="Main navigation"
      className="relative z-40 flex shrink-0 w-full border-t border-border/40 bg-surface-container gpu-layer"
      style={{
        paddingBottom: "max(0.25rem, env(safe-area-inset-bottom, 0.25rem))",
      }}
    >
      {items.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
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
