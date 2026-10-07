"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Truck,
  LogOut,
  Store,
  Users,
  FileSpreadsheet,
  Database,
  HelpCircle,
  CalendarCheck,
  Settings,
  X,
  UserCheck,
  ReceiptText,
  TrendingDown,
} from "lucide-react";
import { db, BUSINESS_PROFILE_SINGLETON_ID } from "@/lib/db";
import { getBrandingConfig } from "@/config/branding";
import { useSideDrawer } from "@/components/ui/DrawerContext";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { hasCapability } from "@/features/auth/authorization";
import type { WorkerCapability } from "@/features/auth/authorization";
import { signOut } from "@/features/auth/logout";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  badge?: React.ReactNode;
  ownerOnly?: boolean;
  capability?: WorkerCapability;
}

interface DrawerSection {
  title: string;
  items: NavItem[];
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
  const branding = getBrandingConfig();
  const storeName = businessProfile?.name?.trim() || branding.businessName;

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

  /**
   * Material UI / M3 standard grouped drawer navigation:
   * Categorized into concise, non-overwhelming sections with clear hierarchy.
   */
  const sections: DrawerSection[] = [
    {
      title: "Daily Operations",
      items: [
        {
          label: "Sales History",
          href: "/sales",
          icon: ReceiptText,
          capability: "VIEW_OWN_SALES",
        },
        {
          label: "Expenses",
          href: "/expenses",
          icon: TrendingDown,
          capability: "MANAGE_EXPENSES",
        },
        {
          label: "Purchases & Restock",
          href: "/purchases",
          icon: Truck,
          capability: "RECEIVE_STOCK",
        },
        {
          label: "Close Day Register",
          href: "/close-day",
          icon: CalendarCheck,
          capability: "SUBMIT_RECONCILIATION",
        },
      ],
    },
    {
      title: "People & Contacts",
      items: [
        {
          label: "Contacts & Debtors",
          href: "/contacts",
          icon: Users,
          capability: "VIEW_CUSTOMERS",
        },
        {
          label: "Staff & Permissions",
          href: "/staff",
          icon: UserCheck,
          ownerOnly: true,
        },
      ],
    },
    {
      title: "Business & Settings",
      items: [
        {
          label: "Business Profile",
          href: "/profile",
          icon: Store,
        },
        {
          label: "Import / Export Catalog",
          href: "/products/import",
          icon: FileSpreadsheet,
          capability: "MANAGE_PRODUCTS",
        },
        {
          label: "Backup & Offline Storage",
          href: "/settings/data",
          icon: Database,
          ownerOnly: true,
        },
        {
          label: "App Settings",
          href: "/settings",
          icon: Settings,
        },
      ],
    },
  ];

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className={`fixed inset-0 z-[var(--z-drawer)] bg-[var(--color-scrim)] transition-opacity duration-[280ms] ease-out ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={closeDrawer}
        aria-hidden="true"
      />

      {/* Slide-out Drawer Panel (M3 / Material UI specification, 60fps GPU accelerated) */}
      <aside
        ref={drawerRef}
        className={`fixed inset-y-0 top-0 bottom-0 left-0 z-[var(--z-drawer)] flex h-dvh max-h-dvh min-h-0 w-[310px] max-w-[85vw] flex-col bg-surface shadow-2xl gpu-layer transition-transform duration-[280ms] will-change-transform ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        aria-label="Navigation drawer"
        aria-hidden={!isOpen}
        inert={!isOpen || undefined}
      >
        {/* Drawer Header: Clean Identity Banner */}
        <div className="flex shrink-0 items-center justify-between px-4 pt-5 pb-4 bg-brand-accent text-brand-accent-contrast select-none shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white shadow-xs">
              <Store size={20} aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <p className="truncate text-base font-bold text-white tracking-tight" title={storeName}>
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
              <p className="truncate text-xs text-white/80 font-medium mt-0.5" title={user.fullName || "User"}>
                {user.fullName || "User"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="Close navigation drawer"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 active:scale-95 transition-all shrink-0 ml-2"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        {/* Grouped Navigation Items (Material UI standard) */}
        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 space-y-4">
          {sections.map((section, sIdx) => {
            const visibleItems = section.items.filter(
              (item) => (!item.ownerOnly || isOwnerOrAdmin) && (!item.capability || hasCapability(user, item.capability))
            );

            if (visibleItems.length === 0) return null;

            return (
              <div key={section.title} className="space-y-1">
                {sIdx > 0 && <div className="border-t border-border/40 my-2.5 mx-2" />}
                <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-muted">
                  {section.title}
                </p>
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={closeDrawer}
                      prefetch={true}
                      className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[length:var(--font-size-body)] font-medium transition-all ${
                        isActive
                          ? "bg-brand-accent/15 text-brand-accent-active font-semibold shadow-xs"
                          : "text-on-surface hover:bg-surface-container active:scale-[0.99]"
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
              </div>
            );
          })}
        </nav>

        {/* Drawer Footer: Support, Appearance & Sign Out */}
        <div className="shrink-0 space-y-2 border-t border-border/40 bg-surface-container-low px-3.5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0.75rem))]">
          <Link
            href="/settings/help"
            onClick={closeDrawer}
            className="flex items-center gap-3 rounded-xl px-3.5 py-2 text-xs font-medium text-on-surface hover:bg-surface-container transition-colors"
          >
            <HelpCircle size={16} className="text-on-surface-muted" aria-hidden />
            <span>Help & Support</span>
          </Link>

          <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-container px-3.5 py-2">
            <span className="text-xs font-semibold text-on-surface">Appearance</span>
            <ThemeToggle variant="pill-icons" />
          </div>

          <button
            type="button"
            onClick={async () => {
              closeDrawer();
              await signOut();
            }}
            className="flex min-h-[var(--touch-target-min)] w-full items-center justify-center gap-2 rounded-xl bg-danger/10 px-3 py-2 text-xs font-semibold text-danger hover:bg-danger/15 active:scale-[0.98] transition-all"
            title="Sign Out"
            aria-label="Sign Out"
          >
            <LogOut size={14} aria-hidden />
            <span>Sign Out</span>
          </button>

          <p className="text-center text-[10px] text-on-surface-muted pt-0.5">
            {branding.businessName} • Offline-First Retail
          </p>
        </div>
      </aside>
    </>
  );
}
