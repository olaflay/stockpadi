"use client";

import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Users,
  Wallet,
  Truck,
  ClipboardCheck,
  CalendarCheck,
  Settings,
  Database,
  HelpCircle,
  LogOut,
  ChevronRight,
  Store,
  FileSpreadsheet,
  ReceiptText,
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
 * The More Page — Streamlined operations & store management cockpit.
 * Designed for immediate clarity so a new user is never overwhelmed:
 * 1. Store Profile & User Card
 * 2. Daily Cash & Relationships (Contacts, Expenses, Close Day)
 * 3. Inventory & Stock Tools (Purchases, Stock Count, Import/Export)
 * 4. Store & System (Settings, Data & Sync, Help & Support)
 * 5. Display Preferences & Sign Out
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
    <div className="flex flex-col gap-6 pb-24">
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

      {/* 1. Daily Cash & Relationships */}
      <section className="flex flex-col">
        <h2 className="px-1 pb-2 text-[12px] font-semibold uppercase tracking-wider text-on-surface-muted">
          Daily Cash & Relationships
        </h2>
        <div className="flex flex-col divide-y divide-border/20 rounded-2xl bg-surface-container overflow-hidden">
          {hasCapability(user, "VIEW_CUSTOMERS") && (
            <SettingsRow
              icon={Users}
              tone="brand"
              label="Contacts & Debtors"
              description="Customers, debtors owing you money, and wholesale suppliers"
              onClick={() => router.push("/contacts")}
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
              description="Record daily shop spending, bills, transport, and cash payouts"
              onClick={() => router.push("/expenses")}
            />
          )}

          {hasCapability(user, "SUBMIT_RECONCILIATION") && (
            <SettingsRow
              icon={CalendarCheck}
              tone="brand"
              label="Close Day"
              description="End-of-day register settlement and cash drawer tally"
              onClick={() => router.push("/close-day")}
            />
          )}
        </div>
      </section>

      {/* 2. Inventory & Stock Tools */}
      <section className="flex flex-col">
        <h2 className="px-1 pb-2 text-[12px] font-semibold uppercase tracking-wider text-on-surface-muted">
          Inventory & Stock Tools
        </h2>
        <div className="flex flex-col divide-y divide-border/20 rounded-2xl bg-surface-container overflow-hidden">
          {hasCapability(user, "RECEIVE_STOCK") && (
            <SettingsRow
              icon={Truck}
              tone="neutral"
              label="Purchases & Restock"
              description="Record new inventory received from suppliers"
              onClick={() => router.push("/purchases")}
            />
          )}

          {hasCapability(user, "SUBMIT_STOCK_COUNT") && (
            <SettingsRow
              icon={ClipboardCheck}
              tone="neutral"
              label="Stock Count"
              description="Physical shelf count and inventory reconciliation"
              onClick={() => router.push("/stock-count")}
            />
          )}

          {(isOwnerOrAdmin || hasCapability(user, "MANAGE_PRODUCTS")) && (
            <SettingsRow
              icon={FileSpreadsheet}
              tone="neutral"
              label="Import / Export Catalog"
              description="Bulk upload or download products via Excel / CSV"
              onClick={() => router.push("/products/import")}
            />
          )}
        </div>
      </section>

      {/* 3. Store Management & System */}
      <section className="flex flex-col">
        <h2 className="px-1 pb-2 text-[12px] font-semibold uppercase tracking-wider text-on-surface-muted">
          Store & System
        </h2>
        <div className="flex flex-col divide-y divide-border/20 rounded-2xl bg-surface-container overflow-hidden">
          {isOwnerOrAdmin && (
            <SettingsRow
              icon={Settings}
              tone="neutral"
              label="Store & Staff Settings"
              description="Receipt details, branches, staff accounts & outlets"
              onClick={() => router.push("/settings")}
            />
          )}

          {isOwnerOrAdmin && (
            <SettingsRow
              icon={Database}
              tone="neutral"
              label="Data, Sync & Backups"
              description="Sync diagnostics, offline outbox, and device backup"
              onClick={() => router.push("/settings/data")}
            />
          )}

          <SettingsRow
            icon={HelpCircle}
            tone="neutral"
            label="Help & Support"
            description="User guide, offline FAQs, and customer support"
            onClick={() => router.push("/settings/help")}
          />
        </div>
      </section>

      {/* 4. Display Preferences */}
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
