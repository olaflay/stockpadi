"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  X,
  LayoutDashboard,
  Receipt,
  Package,
  ReceiptText,
  Users,
  UserCircle,
  ClipboardCheck,
  Truck,
  Wallet,
  CalendarCheck,
  BarChart3,
  Bell,
  Settings,
  LogOut,
  Store,
} from "lucide-react";
import { db, BUSINESS_PROFILE_SINGLETON_ID } from "@/lib/db";
import { getBrandingConfig } from "@/config/branding";
import { useSideDrawer } from "@/components/ui/DrawerContext";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { signOut } from "@/features/auth/logout";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { AlertBadge } from "@/components/ui/AlertBadge";

interface NavGroup {
  title?: string;
  items: {
    label: string;
    href: string;
    icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
    badge?: React.ReactNode;
    ownerOnly?: boolean;
  }[];
}

export function SideDrawer() {
  const { isOpen, closeDrawer } = useSideDrawer();
  const pathname = usePathname();
  const user = useCurrentUser();
  const isOwnerOrAdmin = user.accountType === "BUSINESS_OWNER" || user.accountType === "ADMIN";

  // Dynamic store name from local business profile
  const businessProfile = useLiveQuery(
    () => db.businessProfile.get(BUSINESS_PROFILE_SINGLETON_ID),
    []
  );
  const storeName = businessProfile?.name?.trim() || getBrandingConfig().businessName;

  // Close drawer on path change
  useEffect(() => {
    closeDrawer();
  }, [pathname, closeDrawer]);

  // Handle escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        closeDrawer();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeDrawer]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const navGroups: NavGroup[] = [
    {
      title: "Main Operations",
      items: [
        {
          label: "Dashboard",
          href: isOwnerOrAdmin ? "/dashboard" : "/work",
          icon: LayoutDashboard,
          badge: <AlertBadge />,
        },
        {
          label: "Sell (POS)",
          href: isOwnerOrAdmin ? "/pos" : "/work/pos",
          icon: Receipt,
        },
        {
          label: "Products & Stock",
          href: isOwnerOrAdmin ? "/products" : "/work/products",
          icon: Package,
        },
        {
          label: "Customers & Debt",
          href: isOwnerOrAdmin ? "/customers" : "/work/customers",
          icon: UserCircle,
        },
      ],
    },
    {
      title: "Operations & Inventory",
      items: [
        {
          label: "Sales & Receipts",
          href: isOwnerOrAdmin ? "/sales" : "/work/sales",
          icon: ReceiptText,
        },
        {
          label: "Stock Count",
          href: isOwnerOrAdmin ? "/stock-count" : "/work/stock-count",
          icon: ClipboardCheck,
        },
        {
          label: "Restock",
          href: "/purchases",
          icon: Truck,
          ownerOnly: true,
        },
        {
          label: "Expenses",
          href: "/expenses",
          icon: Wallet,
          ownerOnly: true,
        },
        {
          label: "Close Day (Cash Count)",
          href: isOwnerOrAdmin ? "/close-day" : "/work/close-day",
          icon: CalendarCheck,
        },
      ],
    },
    {
      title: "Management",
      items: [
        {
          label: "Reports",
          href: "/reports",
          icon: BarChart3,
          ownerOnly: true,
        },
        {
          label: "Staff & Access",
          href: "/staff",
          icon: Users,
          ownerOnly: true,
        },
        {
          label: "Stock & Alerts",
          href: isOwnerOrAdmin ? "/alerts" : "/work/alerts",
          icon: Bell,
        },
        {
          label: "Settings",
          href: "/settings",
          icon: Settings,
          ownerOnly: true,
        },
      ],
    },
  ];

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className={`fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] transition-opacity duration-[280ms] ease-out ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={closeDrawer}
        aria-hidden="true"
      />

      {/* Slide-out Drawer Panel (Google Drive style, 60fps GPU accelerated) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[300px] max-w-[85vw] flex-col border-r border-border bg-surface shadow-[var(--shadow-elevation-4)] gpu-layer transition-transform duration-[280ms] will-change-transform ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        aria-label="Navigation drawer"
        aria-hidden={!isOpen}
      >
        {/* Drawer Header with Store Name at the top */}
        <div
          className="flex flex-col px-4 pt-5 pb-4 text-brand-accent-contrast select-none"
          style={{
            background: "linear-gradient(180deg, var(--color-brand-accent) 0%, #064e3b 100%)",
            boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.15)",
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white shadow-xs">
                <Store size={20} aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-white tracking-tight" title={storeName}>
                  {storeName}
                </p>
                <span className="inline-flex items-center rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium text-white/95 uppercase tracking-wider">
                  {user.accountType === "ADMIN"
                    ? "Admin"
                    : user.accountType === "BUSINESS_OWNER"
                    ? "Owner"
                    : "Staff"}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={closeDrawer}
              aria-label="Close navigation menu"
              className="flex h-8 w-8 items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 active:scale-95 transition-all -mr-1"
            >
              <X size={18} aria-hidden />
            </button>
          </div>

          {/* User info subtitle */}
          <p className="mt-3 truncate text-xs text-white/80 font-medium">
            Logged in as: <span className="text-white font-semibold">{user.fullName || "User"}</span>
          </p>
        </div>

        {/* Navigation Items (Scrollable) */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {navGroups.map((group, groupIdx) => {
            const visibleItems = group.items.filter((item) => !item.ownerOnly || isOwnerOrAdmin);
            if (visibleItems.length === 0) return null;

            return (
              <div key={group.title || groupIdx} className="space-y-1">
                {group.title && (
                  <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-on-surface-muted">
                    {group.title}
                  </p>
                )}
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={closeDrawer}
                      prefetch={true}
                      className={`flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-2.5 text-[length:var(--font-size-body)] font-medium transition-colors ${
                        isActive
                          ? "bg-brand-accent/10 text-brand-accent-active font-semibold shadow-xs"
                          : "text-on-surface hover:bg-surface-container"
                      }`}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <Icon
                        size={20}
                        className={isActive ? "text-brand-accent-active" : "text-on-surface-muted"}
                        aria-hidden
                      />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.badge && <span className="shrink-0">{item.badge}</span>}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Drawer Footer: Theme, Sign Out, Version */}
        <div className="border-t border-border p-3 space-y-2 bg-surface-container-low/40">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs font-medium text-on-surface-muted">Appearance</span>
            <ThemeToggle />
          </div>

          <button
            type="button"
            onClick={async () => {
              closeDrawer();
              await signOut();
            }}
            className="flex w-full items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-[length:var(--font-size-body)] font-medium text-danger hover:bg-danger-container/30 transition-colors"
          >
            <LogOut size={18} aria-hidden />
            <span>Sign Out</span>
          </button>

          <p className="text-center text-[10px] text-on-surface-muted/80 pt-1">
            StockPadi • Offline-First Retail
          </p>
        </div>
      </aside>
    </>
  );
}
