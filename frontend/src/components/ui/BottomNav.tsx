"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Package, Receipt, BarChart3, Settings } from "lucide-react";

import { useCurrentUser } from "@/features/auth/use-current-user";
import type { AccountType } from "@/features/auth/authorization";
import { AlertBadge } from "@/components/ui/AlertBadge";

/**
 * One UI's bottom interaction area: primary navigation stays within thumb
 * reach at all times. Prefetched links ensure instant sub-16ms page transitions.
 */
const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, accountTypes: ["ADMIN", "BUSINESS_OWNER"] as AccountType[] },
  { href: "/pos", label: "Sell", icon: Receipt, accountTypes: ["ADMIN", "BUSINESS_OWNER", "WORKER"] as AccountType[] },
  { href: "/products", label: "Products", icon: Package, accountTypes: ["ADMIN", "BUSINESS_OWNER", "WORKER"] as AccountType[] },
  { href: "/reports", label: "Reports", icon: BarChart3, accountTypes: ["ADMIN", "BUSINESS_OWNER"] as AccountType[] },
  { href: "/settings", label: "Settings", icon: Settings, accountTypes: ["ADMIN", "BUSINESS_OWNER"] as AccountType[] },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const user = useCurrentUser();

  const allowedItems = NAV_ITEMS.filter((item) => item.accountTypes.includes(user.accountType ?? "WORKER"));

  return (
    <nav aria-label="Main navigation" className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] gpu-layer">
      {allowedItems.map((item) => {
        const isActive = pathname.startsWith(item.href);
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
              {item.href === "/dashboard" && <AlertBadge />}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
