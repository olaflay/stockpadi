"use client";

import { useEffect, useRef } from "react";
import * as navigation from "next/navigation";
import {
  TrendingDown,
  ReceiptText,
  ShoppingCart,
  Users,
  ClipboardCheck,
  CalendarCheck,
  BarChart3,
  FileSpreadsheet,
  Settings,
  X,
} from "lucide-react";

import { useCurrentUser, hasAccountType } from "@/features/auth/use-current-user";
import { hasCapability } from "@/features/auth/authorization";

interface MoreSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  activePath?: string;
}

export function MoreSheetModal({ isOpen, onClose, activePath }: MoreSheetModalProps) {
  const router = typeof navigation.useRouter === "function" ? navigation.useRouter() : null;
  const user = useCurrentUser();
  const isOwnerOrAdmin = hasAccountType(user, ["BUSINESS_OWNER", "ADMIN"]);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when sheet is open
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

  if (!isOpen) return null;

  function navigateTo(href: string) {
    onClose();
    if (router && typeof router.push === "function") {
      router.push(href);
    } else if (typeof window !== "undefined") {
      window.location.href = href;
    }
  }

  const menuItems = [
    hasCapability(user, "MANAGE_EXPENSES") && {
      href: "/expenses",
      label: "Expenses",
      icon: TrendingDown,
    },
    hasCapability(user, "VIEW_OWN_SALES") && {
      href: "/sales",
      label: "Sales",
      icon: ReceiptText,
    },
    hasCapability(user, "RECEIVE_STOCK") && {
      href: "/purchases",
      label: "Purchases",
      icon: ShoppingCart,
    },
    hasCapability(user, "VIEW_CUSTOMERS") && {
      href: "/contacts",
      label: "Contacts",
      icon: Users,
    },
    hasCapability(user, "SUBMIT_STOCK_COUNT") && {
      href: "/stock-count",
      label: "Stock Count",
      icon: ClipboardCheck,
    },
    hasCapability(user, "SUBMIT_RECONCILIATION") && {
      href: "/close-day",
      label: "Close Day",
      icon: CalendarCheck,
    },
    hasCapability(user, "VIEW_REPORTS") && {
      href: "/reports",
      label: "Reports",
      icon: BarChart3,
    },
    (isOwnerOrAdmin || hasCapability(user, "MANAGE_PRODUCTS")) && {
      href: "/products/import",
      label: "Catalog",
      icon: FileSpreadsheet,
    },
    {
      href: "/settings",
      label: "Settings",
      icon: Settings,
    },
  ].filter(Boolean) as Array<{
    href: string;
    label: string;
    icon: typeof Settings;
  }>;

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col justify-end pointer-events-none"
      style={{ paddingBottom: "calc(68px + env(safe-area-inset-bottom, 0px))" }}
    >
      {/* Dimmed backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-fade-in pointer-events-auto"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Bottom Sheet Container */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="More navigation menu"
        className="relative z-10 flex max-h-[75vh] w-full max-w-lg mx-auto flex-col rounded-2xl border border-border/40 bg-surface shadow-2xl animate-sheet-up overflow-hidden pointer-events-auto mx-2"
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <span className="text-xs font-bold tracking-widest text-on-surface-muted uppercase">MORE</span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-muted hover:bg-surface-container hover:text-on-surface transition-colors"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Compact 3-Column Grid */}
        <div className="px-4 pb-6 pt-1">
          <div className="grid grid-cols-3 gap-2.5">
            {menuItems.map((item) => {
              const isActive = activePath === item.href;
              const Icon = item.icon;
              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => navigateTo(item.href)}
                  className={`flex flex-col items-center justify-center gap-2 p-3 sm:py-3.5 rounded-2xl transition-all text-center ${
                    isActive
                      ? "bg-brand-accent/15 border border-brand-accent/40 text-brand-accent font-semibold"
                      : "bg-surface-container-low hover:bg-surface-container border border-border/30 text-on-surface active:scale-95"
                  }`}
                >
                  <Icon size={22} className={isActive ? "text-brand-accent" : "text-on-surface-muted"} />
                  <span className="text-xs font-medium truncate w-full text-center">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
