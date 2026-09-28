"use client";

import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  UserCircle,
  Wallet,
  Truck,
  ClipboardCheck,
  Bell,
  CalendarCheck,
  ReceiptText,
  Settings,
  Users,
  FileSpreadsheet,
  Database,
  HelpCircle,
  LogOut,
  ChevronRight,
  Store,
} from "lucide-react";

import { db, BUSINESS_PROFILE_SINGLETON_ID } from "@/lib/db";
import { getBrandingConfig } from "@/config/branding";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SettingsRow } from "@/components/ui/SettingsRow";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { RippleButton } from "@/components/ui/Ripple";
import { useCurrentUser, hasAccountType } from "@/features/auth/use-current-user";
import { hasCapability } from "@/features/auth/authorization";
import { signOut } from "@/features/auth/logout";

/**
 * The More Page — Authoritative business & operations hub.
 * Replaces the static Settings tab with an actionable cockpit covering:
 * 1. Store & Profile Overview
 * 2. High-frequency Business Operations (Customers, Expenses, Restock, Stock Count, Close Day)
 * 3. Settings & Administration (Store & POS Settings, Staff, Import/Export, Backup, Help)
 * 4. Preferences & Session (Appearance, Sign Out)
 */
export default function MorePage() {
  const router = useRouter();
  const user = useCurrentUser();
  const branding = getBrandingConfig();
  const isOwnerOrAdmin = hasAccountType(user, ["BUSINESS_OWNER", "ADMIN"]);

  const businessProfile = useLiveQuery(
    () => db.businessProfile.get(BUSINESS_PROFILE_SINGLETON_ID),
    []
  );
  const storeName = businessProfile?.name?.trim() || branding.businessName;

  async function handleLogout() {
    await signOut();
    router.replace("/login?force=true");
  }

  const roleLabel =
    user.accountType === "BUSINESS_OWNER"
      ? "Owner"
      : user.accountType === "ADMIN"
        ? "Admin"
        : "Staff";

  return (
    <div className="flex flex-col gap-6 pb-20">
      <ScreenHeader title="More" hideBack={true} />

      {/* Store Identity & Profile Card */}
      <RippleButton
        type="button"
        onClick={() => router.push("/profile")}
        className="flex items-center justify-between gap-3.5 rounded-2xl bg-surface-container px-4 py-3.5 text-left hover:bg-surface-container-high transition-colors active:scale-[0.99]"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-container text-on-brand-container">
          <Store size={22} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-base font-bold text-on-surface">{storeName}</p>
            <span className="shrink-0 inline-flex items-center rounded-full bg-brand-container px-2 py-0.5 text-[10px] font-semibold text-on-brand-container uppercase tracking-wider">
              {roleLabel}
            </span>
          </div>
          <p className="truncate text-xs text-on-surface-muted mt-0.5" title={user.fullName || "My Account"}>
            {user.fullName ? `${user.fullName} · Profile & details` : "Manage store profile & account"}
          </p>
        </div>
        <ChevronRight size={18} className="shrink-0 text-on-surface-muted" aria-hidden />
      </RippleButton>

      {/* 1. Daily Operations */}
      <section className="flex flex-col">
        <h2 className="px-1 pb-2 text-[12px] font-semibold uppercase tracking-wider text-on-surface-muted">
          Daily Operations
        </h2>
        <div className="flex flex-col divide-y divide-border/20 rounded-2xl bg-surface-container overflow-hidden">
          {hasCapability(user, "VIEW_CUSTOMERS") && (
            <SettingsRow
              icon={UserCircle}
              tone="brand"
              label="Customers & Debts"
              description="Customer balances, debt tracking, and credit"
              onClick={() => router.push("/customers")}
            />
          )}

          {hasCapability(user, "VIEW_OWN_SALES") && (
            <SettingsRow
              icon={ReceiptText}
              tone="brand"
              label="Sales & Receipts"
              description="Past sales history and receipt reprinting"
              onClick={() => router.push("/sales")}
            />
          )}

          {hasCapability(user, "MANAGE_EXPENSES") && (
            <SettingsRow
              icon={Wallet}
              tone="warning"
              label="Expenses"
              description="Record daily cash payouts, utility bills, and costs"
              onClick={() => router.push("/expenses")}
            />
          )}

          {hasCapability(user, "RECEIVE_STOCK") && (
            <SettingsRow
              icon={Truck}
              tone="neutral"
              label="Purchases & Restock"
              description="Record new stock deliveries from suppliers"
              onClick={() => router.push("/purchases")}
            />
          )}

          {hasCapability(user, "SUBMIT_STOCK_COUNT") && (
            <SettingsRow
              icon={ClipboardCheck}
              tone="neutral"
              label="Stock Count"
              description="Physical inventory count and audit reconciliation"
              onClick={() => router.push("/stock-count")}
            />
          )}

          {hasCapability(user, "VIEW_ALERTS") && (
            <SettingsRow
              icon={Bell}
              tone="danger"
              label="Stock Alerts"
              description="Low-stock notifications and expiry alerts"
              onClick={() => router.push("/alerts")}
            />
          )}

          {hasCapability(user, "SUBMIT_RECONCILIATION") && (
            <SettingsRow
              icon={CalendarCheck}
              tone="brand"
              label="Close Day"
              description="End-of-day register settlement and cash tally"
              onClick={() => router.push("/close-day")}
            />
          )}
        </div>
      </section>

      {/* 2. Settings & Business Administration */}
      <section className="flex flex-col">
        <h2 className="px-1 pb-2 text-[12px] font-semibold uppercase tracking-wider text-on-surface-muted">
          Settings & Management
        </h2>
        <div className="flex flex-col divide-y divide-border/20 rounded-2xl bg-surface-container overflow-hidden">
          {/* Settings is a dedicated button inside the More page */}
          {isOwnerOrAdmin && (
            <SettingsRow
              icon={Settings}
              tone="neutral"
              label="Store & POS Settings"
              description="Receipt headers, tax rates, barcode, and outlets"
              onClick={() => router.push("/settings")}
            />
          )}

          {isOwnerOrAdmin && (
            <SettingsRow
              icon={Users}
              tone="brand"
              label="Staff & Permissions"
              description="Cashier access control and team accounts"
              onClick={() => router.push("/staff")}
            />
          )}

          {(isOwnerOrAdmin || hasCapability(user, "MANAGE_PRODUCTS")) && (
            <SettingsRow
              icon={FileSpreadsheet}
              tone="neutral"
              label="Import / Export Products"
              description="Bulk upload or export catalog via Excel / CSV"
              onClick={() => router.push("/products/import")}
            />
          )}

          {isOwnerOrAdmin && (
            <SettingsRow
              icon={Database}
              tone="neutral"
              label="Backup & Data Sync"
              description="Sync diagnostics, offline outbox, and data export"
              onClick={() => router.push("/settings/sharing")}
            />
          )}

          <SettingsRow
            icon={HelpCircle}
            tone="neutral"
            label="Help & Support"
            description="User guide, offline tips, and customer support"
            onClick={() => router.push("/settings/help")}
          />
        </div>
      </section>

      {/* 3. Preferences & Session */}
      <section className="flex flex-col">
        <h2 className="px-1 pb-2 text-[12px] font-semibold uppercase tracking-wider text-on-surface-muted">
          Preferences
        </h2>
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-container p-4">
          <div className="min-w-0">
            <p className="text-[length:var(--font-size-body)] font-semibold text-on-surface">Appearance</p>
            <p className="text-[length:var(--font-size-caption)] text-on-surface-muted mt-0.5">Toggle light or dark theme</p>
          </div>
          <div className="shrink-0">
            <ThemeToggle variant="capsule-pill" />
          </div>
        </div>
      </section>

      {/* Sign Out Button */}
      <button
        type="button"
        onClick={handleLogout}
        className="flex min-h-[var(--touch-target-min)] w-full items-center justify-center gap-2 rounded-2xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger hover:bg-danger/15 active:scale-[0.99] transition-all"
        title="Sign Out"
      >
        <LogOut size={16} aria-hidden />
        <span>Sign Out</span>
      </button>
    </div>
  );
}
