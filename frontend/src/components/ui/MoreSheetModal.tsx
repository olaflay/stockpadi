"use client";

import { useEffect, useRef } from "react";
import * as navigation from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Users,
  Wallet,
  Truck,
  ClipboardCheck,
  CalendarCheck,
  Settings,
  LogOut,
  ChevronRight,
  Store,
  FileSpreadsheet,
  ReceiptText,
  X,
} from "lucide-react";

import { db, BUSINESS_PROFILE_SINGLETON_ID } from "@/lib/db";
import { getBrandingConfig } from "@/config/branding";
import { useCurrentUser, hasAccountType } from "@/features/auth/use-current-user";
import { hasCapability } from "@/features/auth/authorization";
import { signOut } from "@/features/auth/logout";

interface MoreSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  activePath?: string;
}

export function MoreSheetModal({ isOpen, onClose, activePath }: MoreSheetModalProps) {
  const router = typeof navigation.useRouter === "function" ? navigation.useRouter() : null;
  const user = useCurrentUser();
  const branding = getBrandingConfig();
  const isOwnerOrAdmin = hasAccountType(user, ["BUSINESS_OWNER", "ADMIN"]);
  const sheetRef = useRef<HTMLDivElement>(null);

  const businessProfile = useLiveQuery(
    () => db.businessProfile.get(BUSINESS_PROFILE_SINGLETON_ID),
    []
  );
  const storeName = businessProfile?.name?.trim() || branding.businessName;

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

  async function handleLogout() {
    onClose();
    await signOut();
    if (router && typeof router.replace === "function") {
      router.replace("/login?force=true");
    } else if (typeof window !== "undefined") {
      window.location.href = "/login?force=true";
    }
  }

  const roleLabel =
    user.accountType === "BUSINESS_OWNER"
      ? "Owner"
      : user.accountType === "ADMIN"
        ? "Admin"
        : "Staff";

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Dimmed backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Bottom Sheet Container */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="More navigation menu"
        className="relative z-10 flex max-h-[85vh] w-full flex-col rounded-t-[28px] border-t border-border/40 bg-surface shadow-2xl animate-sheet-up overflow-hidden"
      >
        {/* Grab Handle & Top Bar */}
        <div className="flex items-center justify-between px-5 pt-3.5 pb-2">
          <div className="flex-1" />
          <div className="h-1.5 w-12 rounded-full bg-border" />
          <div className="flex-1 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-muted hover:bg-surface-container hover:text-on-surface transition-colors"
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-8 pt-1">
          {/* Store Profile Card */}
          <button
            type="button"
            onClick={() => navigateTo("/profile")}
            className="flex items-center justify-between gap-3.5 rounded-2xl bg-surface-container p-3.5 text-left hover:bg-surface-container-high transition-colors active:scale-[0.99]"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-container text-on-brand-container">
              <Store size={22} aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-bold text-on-surface">{storeName}</p>
                <span className="shrink-0 inline-flex items-center rounded-full bg-brand-container px-2 py-0.5 text-[10px] font-semibold text-on-brand-container uppercase tracking-wider">
                  {roleLabel}
                </span>
              </div>
              <p className="truncate text-xs text-on-surface-muted mt-0.5">
                {user.fullName ? `${user.fullName} · Profile & details` : "Manage store profile & account"}
              </p>
            </div>
            <ChevronRight size={18} className="shrink-0 text-on-surface-muted" aria-hidden />
          </button>

          {/* Quick Shortcuts Grid */}
          <div className="grid grid-cols-2 gap-2.5">
            {hasCapability(user, "VIEW_CUSTOMERS") && (
              <button
                type="button"
                onClick={() => navigateTo("/contacts")}
                className={`flex items-center gap-3 rounded-2xl p-3 text-left transition-all ${
                  activePath === "/contacts"
                    ? "bg-brand-container/60 border border-brand-accent/30 text-on-surface font-semibold"
                    : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                }`}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-container text-on-brand-container">
                  <Users size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">Contacts</p>
                  <p className="text-[10px] text-on-surface-muted truncate">Debtors & suppliers</p>
                </div>
              </button>
            )}

            {hasCapability(user, "VIEW_OWN_SALES") && (
              <button
                type="button"
                onClick={() => navigateTo("/sales")}
                className={`flex items-center gap-3 rounded-2xl p-3 text-left transition-all ${
                  activePath === "/sales"
                    ? "bg-brand-container/60 border border-brand-accent/30 text-on-surface font-semibold"
                    : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                }`}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-container text-on-brand-container">
                  <ReceiptText size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">Sales History</p>
                  <p className="text-[10px] text-on-surface-muted truncate">Receipts & records</p>
                </div>
              </button>
            )}

            {hasCapability(user, "MANAGE_EXPENSES") && (
              <button
                type="button"
                onClick={() => navigateTo("/expenses")}
                className={`flex items-center gap-3 rounded-2xl p-3 text-left transition-all ${
                  activePath === "/expenses"
                    ? "bg-warning-container/60 border border-warning/30 text-on-surface font-semibold"
                    : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                }`}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-warning-container text-on-warning-container">
                  <Wallet size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">Expenses</p>
                  <p className="text-[10px] text-on-surface-muted truncate">Shop daily spend</p>
                </div>
              </button>
            )}

            {hasCapability(user, "RECEIVE_STOCK") && (
              <button
                type="button"
                onClick={() => navigateTo("/purchases")}
                className={`flex items-center gap-3 rounded-2xl p-3 text-left transition-all ${
                  activePath === "/purchases"
                    ? "bg-success-container/60 border border-success/30 text-on-surface font-semibold"
                    : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                }`}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-success-container text-on-success-container">
                  <Truck size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">Purchases</p>
                  <p className="text-[10px] text-on-surface-muted truncate">Restocks received</p>
                </div>
              </button>
            )}

            {hasCapability(user, "SUBMIT_STOCK_COUNT") && (
              <button
                type="button"
                onClick={() => navigateTo("/stock-count")}
                className={`flex items-center gap-3 rounded-2xl p-3 text-left transition-all ${
                  activePath === "/stock-count"
                    ? "bg-brand-container/60 border border-brand-accent/30 text-on-surface font-semibold"
                    : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                }`}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-container-highest text-on-surface">
                  <ClipboardCheck size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">Stock Count</p>
                  <p className="text-[10px] text-on-surface-muted truncate">Audit shelf count</p>
                </div>
              </button>
            )}

            {hasCapability(user, "SUBMIT_RECONCILIATION") && (
              <button
                type="button"
                onClick={() => navigateTo("/close-day")}
                className={`flex items-center gap-3 rounded-2xl p-3 text-left transition-all ${
                  activePath === "/close-day"
                    ? "bg-brand-container/60 border border-brand-accent/30 text-on-surface font-semibold"
                    : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                }`}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-container text-on-brand-container">
                  <CalendarCheck size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">Close Day</p>
                  <p className="text-[10px] text-on-surface-muted truncate">Register settlement</p>
                </div>
              </button>
            )}
          </div>

          {/* List Options */}
          <div className="flex flex-col divide-y divide-border/20 rounded-2xl bg-surface-container overflow-hidden">
            {(isOwnerOrAdmin || hasCapability(user, "MANAGE_PRODUCTS")) && (
              <button
                type="button"
                onClick={() => navigateTo("/products/import")}
                className="flex items-center justify-between px-4 py-3 text-left hover:bg-surface-container-high transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FileSpreadsheet size={18} className="text-on-surface-muted" />
                  <div>
                    <p className="text-xs font-semibold text-on-surface">Import / Export Catalog</p>
                    <p className="text-[10px] text-on-surface-muted">Excel / CSV backup & bulk upload</p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-on-surface-muted" />
              </button>
            )}

            <button
              type="button"
              onClick={() => navigateTo("/settings")}
              className="flex items-center justify-between px-4 py-3 text-left hover:bg-surface-container-high transition-colors"
            >
              <div className="flex items-center gap-3">
                <Settings size={18} className="text-on-surface-muted" />
                <div>
                  <p className="text-xs font-semibold text-on-surface">Settings & Preferences</p>
                  <p className="text-[10px] text-on-surface-muted">
                    {isOwnerOrAdmin ? "Store, staff, receipt details & sync" : "Display theme & account"}
                  </p>
                </div>
              </div>
              <ChevronRight size={16} className="text-on-surface-muted" />
            </button>
          </div>

          {/* Sign Out */}
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center justify-center gap-2 rounded-2xl bg-danger-container/20 py-3 text-xs font-semibold text-danger hover:bg-danger-container/30 transition-colors"
          >
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
