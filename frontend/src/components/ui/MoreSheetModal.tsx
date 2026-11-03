"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
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
import { acquireOverlayScrollLock } from "@/components/ui/overlay-scroll-lock";
import { useSheetDrag } from "@/components/ui/use-sheet-drag";

interface MoreSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  activePath?: string;
}

export function MoreSheetModal({ isOpen, onClose, activePath }: MoreSheetModalProps) {
  const user = useCurrentUser();
  const isOwnerOrAdmin = hasAccountType(user, ["BUSINESS_OWNER", "ADMIN"]);
  const bottomNavHrefs = new Set(
    isOwnerOrAdmin
      ? ["/dashboard", "/pos", "/products", "/reports", "/more"]
      : ["/dashboard", "/pos", "/products", "/stock-count", "/more"],
  );
  const { sheetRef, scrimRef, dragProps, resetDragPosition } = useSheetDrag({
    enabled: isOpen,
    onDismiss: onClose,
  });
  const triggerElementRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (isOpen) resetDragPosition();
  }, [isOpen, resetDragPosition]);

  // Modal keyboard behavior: enter the sheet, trap focus, restore the trigger.
  useEffect(() => {
    if (!isOpen) return;
    triggerElementRef.current = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => sheetRef.current?.focus({ preventScroll: true }), 0);

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !sheetRef.current) return;
      const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) {
        e.preventDefault();
        sheetRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (document.activeElement === sheetRef.current || !sheetRef.current.contains(document.activeElement)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      triggerElementRef.current?.focus();
    };
  }, [isOpen, sheetRef]);

  // Lock body scroll when sheet is open
  useEffect(() => {
    if (!isOpen) return;
    return acquireOverlayScrollLock();
  }, [isOpen]);

  if (!isOpen) return null;

  const menuItems = [
    hasCapability(user, "MANAGE_EXPENSES") && {
      href: "/expenses",
      label: "Expenses",
      icon: TrendingDown,
    },
    (hasCapability(user, "VIEW_OWN_SALES") || hasCapability(user, "VIEW_BRANCH_SALES")) && {
      href: "/sales",
      label: "Sales",
      icon: ReceiptText,
    },
    hasCapability(user, "RECEIVE_STOCK") && {
      href: "/purchases",
      label: "Stock",
      icon: ShoppingCart,
    },
    hasCapability(user, "VIEW_CUSTOMERS") && {
      href: "/contacts",
      label: "Contacts",
      icon: Users,
    },
    hasCapability(user, "SUBMIT_STOCK_COUNT") && {
      href: "/stock-count",
      label: "Stock count",
      icon: ClipboardCheck,
    },
    hasCapability(user, "SUBMIT_RECONCILIATION") && {
      href: "/close-day",
      label: "Close day",
      icon: CalendarCheck,
    },
    hasCapability(user, "VIEW_REPORTS") && {
      href: "/reports",
      label: "Reports",
      icon: BarChart3,
    },
    (isOwnerOrAdmin || hasCapability(user, "MANAGE_PRODUCTS")) && {
      href: "/products/import",
      label: "Product imports",
      icon: FileSpreadsheet,
    },
    {
      href: "/settings",
      label: "Settings",
      icon: Settings,
    },
  ].filter(Boolean).filter((item) => !bottomNavHrefs.has((item as { href: string }).href)) as Array<{
    href: string;
    label: string;
    icon: typeof Settings;
  }>;

  return (
    <div
      data-modal-container
      className="fixed inset-0 z-[var(--z-modal)] flex flex-col justify-end pointer-events-none pb-[env(safe-area-inset-bottom,0px)]"
    >
      {/* Static scrim avoids unnecessary GPU blur on low-end devices. */}
      <div
        ref={scrimRef}
        className="fixed inset-0 bg-black/45 animate-modal-scrim-in pointer-events-auto"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* M3 Bottom Sheet Container */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="More navigation menu"
        tabIndex={-1}
        className="relative z-10 flex min-h-0 max-h-[78vh] w-full max-w-lg mx-auto flex-col rounded-t-[28px] sm:rounded-[28px] border-t sm:border border-border/40 bg-surface shadow-[0px_8px_24px_rgba(0,0,0,0.12)] animate-sheet-up overflow-hidden pointer-events-auto px-2"
        style={{ boxShadow: "var(--elevation-3), var(--shadow-inner-highlight)" }}
      >
        {/* M3 Drag Handle */}
        <div
          data-sheet-drag-handle
          className="flex h-7 shrink-0 cursor-grab touch-none select-none items-center justify-center overscroll-none sm:hidden active:cursor-grabbing"
          aria-hidden="true"
          {...dragProps}
        >
          <div className="h-1 w-8 rounded-full bg-on-surface-muted/45 transition-colors duration-[var(--motion-duration-short)] ease-[var(--easing-standard)] active:bg-on-surface-muted/70" />
        </div>

        {/* Top Header Bar */}
        <div className="flex min-h-12 shrink-0 items-center justify-between px-4 py-1.5 sm:px-5">
          <span className="text-[length:var(--font-size-body-lg)] font-semibold text-on-surface">More</span>
          <button
            type="button"
            onClick={onClose}
            className="group flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-transparent text-on-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
            aria-label="Close menu"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-container-high transition-[background-color,transform] duration-[var(--motion-duration-short)] ease-[var(--easing-standard)] group-hover:bg-surface-container-highest group-active:scale-90 group-active:bg-surface-container-highest">
              <X size={16} aria-hidden />
            </span>
          </button>
        </div>

        {/* Compact 3-Column Grid */}
        <div className="min-h-0 overflow-y-auto px-4 pb-6 pt-1">
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5">
            {menuItems.map((item) => {
              const isActive = activePath === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  onClick={onClose}
                  className={`min-w-0 flex flex-col items-center justify-center gap-2 rounded-[20px] p-3 sm:py-3.5 transition-all text-center ${
                    isActive
                      ? "bg-brand-accent/15 border border-brand-accent/40 text-brand-accent font-semibold"
                      : "bg-surface-container-low hover:bg-surface-container border border-border/30 text-on-surface active:scale-95"
                  }`}
                >
                  <Icon size={22} className={isActive ? "text-brand-accent" : "text-on-surface-muted"} />
                  <span className="w-full min-w-0 truncate text-xs font-medium text-center">
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
