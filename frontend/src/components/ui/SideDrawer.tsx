"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ReceiptText,
  UserCircle,
  ClipboardCheck,
  Truck,
  Wallet,
  CalendarCheck,
  Bell,
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

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  badge?: React.ReactNode;
  ownerOnly?: boolean;
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

  const drawerRef = React.useRef<HTMLElement>(null);

  // Close on path change
  useEffect(() => {
    closeDrawer();
  }, [pathname, closeDrawer]);

  // Handle escape key and focus trap
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isOpen) return;
      if (e.key === "Escape") {
        closeDrawer();
        return;
      }
      if (e.key === "Tab" && drawerRef.current) {
        const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
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

  const closeDayHref = "/close-day";
  const isCloseDayActive = pathname === closeDayHref || pathname.startsWith(`${closeDayHref}/`);

  const navItems: NavItem[] = [
    {
      label: "Customers",
      href: "/customers",
      icon: UserCircle,
    },
    {
      label: "Sales & Receipts",
      href: "/sales",
      icon: ReceiptText,
    },
    {
      label: "Stock Count",
      href: "/stock-count",
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
      label: "Stock & Alerts",
      href: "/alerts",
      icon: Bell,
      badge: <AlertBadge inline />,
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

      {/* Slide-out Drawer Panel (Google Drive / One UI style, 60fps GPU accelerated) */}
      <aside
        ref={drawerRef}
        className={`fixed inset-y-0 top-0 bottom-0 left-0 z-50 flex h-full w-[310px] max-w-[85vw] flex-col border-r border-border bg-surface shadow-2xl gpu-layer transition-transform duration-[280ms] will-change-transform ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        aria-label="Navigation drawer"
        aria-hidden={!isOpen}
      >
        {/* Drawer Header: Business Name prominently at the top */}
        <div
          className="flex flex-col px-4 pt-6 pb-4.5 text-brand-accent-contrast select-none"
          style={{
            background: "linear-gradient(180deg, var(--color-brand-accent) 0%, #064e3b 100%)",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.12)",
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white shadow-xs">
              <Store size={20} aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              {/* Store name with Owner pill by its side */}
              <div className="flex items-center gap-2 min-w-0">
                <p className="truncate text-base sm:text-lg font-bold text-white tracking-tight" title={storeName}>
                  {storeName}
                </p>
                <span className="shrink-0 inline-flex items-center rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white uppercase tracking-wider">
                  {user.accountType === "ADMIN"
                    ? "Admin"
                    : user.accountType === "BUSINESS_OWNER"
                    ? "Owner"
                    : "Staff"}
                </span>
              </div>
              {/* User name only */}
              <p className="truncate text-xs text-white/80 font-medium mt-0.5" title={user.fullName || "User"}>
                {user.fullName || "User"}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Items (Core 6 items with generous breathing room) */}
        <nav className="flex-1 overflow-y-auto px-3.5 py-3 space-y-1.5">
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-on-surface-muted">
            Operations
          </p>
          {navItems
            .filter((item) => !item.ownerOnly || isOwnerOrAdmin)
            .map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeDrawer}
                  prefetch={true}
                  className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[length:var(--font-size-body)] font-medium transition-colors ${
                    isActive
                      ? "bg-brand-accent/10 text-brand-accent-active font-semibold shadow-xs"
                      : "text-on-surface hover:bg-surface-container"
                  }`}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon
                    size={19}
                    className={isActive ? "text-brand-accent-active" : "text-on-surface-muted"}
                    aria-hidden
                  />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge && <span className="shrink-0 ml-2 flex items-center">{item.badge}</span>}
                </Link>
              );
            })}
        </nav>

        {/* Core Action: Close Day (Prominent Outline Button Style with generous breathing room) */}
        <div className="px-3.5 py-3 border-t border-border/70 bg-surface-container-lowest/30">
          <Link
            href={closeDayHref}
            onClick={closeDrawer}
            prefetch={true}
            className={`flex items-center justify-center gap-2.5 rounded-xl border-2 px-4 py-2.5 text-sm font-semibold transition-all duration-[var(--motion-duration-short)] shadow-xs ${
              isCloseDayActive
                ? "border-brand-accent bg-brand-accent text-brand-accent-contrast shadow-sm"
                : "border-brand-accent/80 text-brand-accent hover:bg-brand-accent/10 active:scale-[0.98]"
            }`}
          >
            <CalendarCheck size={18} aria-hidden />
            <span>Close Day</span>
          </Link>
        </div>

        {/* Drawer Footer: Appearance Row & Sign Out with comfortable breathing room */}
        <div className="border-t border-border px-3.5 py-3 bg-surface-container-low/50 space-y-2.5">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-container/60 border border-border/40 px-3.5 py-2">
            <span className="text-xs font-semibold text-on-surface">Appearance</span>
            <ThemeToggle variant="pill-icons" />
          </div>

          <button
            type="button"
            onClick={async () => {
              closeDrawer();
              await signOut();
            }}
            className="flex min-h-[38px] w-full items-center justify-center gap-2 rounded-xl border border-danger/25 bg-danger/5 px-3 py-2 text-xs font-semibold text-danger hover:bg-danger/10 active:scale-[0.98] transition-all"
            title="Sign Out"
            aria-label="Sign Out"
          >
            <LogOut size={14} aria-hidden />
            <span>Sign Out</span>
          </button>

          <p className="text-center text-[10px] text-on-surface-muted/60 pt-0.5">
            StockPadi • Offline-First Retail
          </p>
        </div>
      </aside>
    </>
  );
}
