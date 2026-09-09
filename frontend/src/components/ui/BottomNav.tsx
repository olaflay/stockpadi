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
  UserCircle,
} from "lucide-react";

import { useCurrentUser } from "@/features/auth/use-current-user";
import { AlertBadge } from "@/components/ui/AlertBadge";

/**
 * Samsung One UI bottom interaction area:
 * Exactly 5 buttons keep touch targets roomy and thumb-reachable on mobile.
 * Adapts dynamically:
 * - Business Owner & Admin: Dashboard | Sell | Products | Reports | Settings
 * - Worker: Dashboard | Sell | Products | Stock | Profile
 */
const OWNER_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, badge: true },
  { href: "/pos", label: "Sell", icon: Receipt },
  { href: "/products", label: "Products", icon: Package },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

const WORKER_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, badge: true },
  { href: "/pos", label: "Sell", icon: Receipt },
  { href: "/products", label: "Products", icon: Package },
  { href: "/stock-count", label: "Stock", icon: ClipboardCheck },
  { href: "/profile", label: "Profile", icon: UserCircle },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const user = useCurrentUser();

  const isOwnerOrAdmin = user.accountType === "BUSINESS_OWNER" || user.accountType === "ADMIN";
  const items = isOwnerOrAdmin ? OWNER_NAV : WORKER_NAV;

  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-0 left-0 right-0 z-40 flex bg-surface/95 backdrop-blur-md gpu-layer after:content-[''] after:absolute after:top-full after:inset-x-0 after:h-32 after:bg-surface after:pointer-events-none"
      style={{
        paddingBottom: "max(1.25rem, env(safe-area-inset-bottom, 1.25rem))",
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
            className={`flex min-h-[var(--touch-target-min)] flex-1 flex-col items-center justify-center gap-1 py-2 text-[length:var(--font-size-caption)] transition-colors duration-[var(--motion-duration-short)] ${
              isActive ? "text-brand-accent-active font-semibold" : "text-on-surface-muted"
            }`}
            aria-current={isActive ? "page" : undefined}
          >
            <span
              className={`relative flex items-center justify-center rounded-full px-4 py-0.5 transition-colors duration-[var(--motion-duration-short)] ${
                isActive ? "bg-brand-accent/10" : ""
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
