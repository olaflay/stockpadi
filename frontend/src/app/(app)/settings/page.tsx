"use client";

import { useRouter } from "next/navigation";
import {
  UserCircle,
  Store,
  Users,
  GitBranch,
  Share2,
  DatabaseBackup,
  Info,
  HelpCircle,
  LogOut,
  Sun,
  ChevronRight,
} from "lucide-react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SettingsRow } from "@/components/ui/SettingsRow";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useCurrentUser, hasAccountType } from "@/features/auth/use-current-user";
import { signOut } from "@/features/auth/logout";

/**
 * Grouped settings list arranged by hierarchy of need:
 * 1. User Profile & Account Identity (Top hero card)
 * 2. Appearance & Theme (Immediate viewing comfort, directly below profile)
 * 3. Team & Staff Management (Core operational priority)
 * 4. Business & Outlets (Store profile and multi-location management)
 * 5. Data & System (Sync health, outbox, local backup & report sharing)
 * 6. Support & Info (Guides, FAQs & system architecture)
 * 7. Session & Exit (Protected danger action)
 */
const CAN_MANAGE_BUSINESS_SETTINGS = ["BUSINESS_OWNER", "ADMIN"] as const;

export default function SettingsPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const canManageBusiness = hasAccountType(user, CAN_MANAGE_BUSINESS_SETTINGS);

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
    <div className="flex flex-col gap-5 pb-8">
      <ScreenHeader title="Settings" hideBack={true} />

      {/* 1. Profile Hero Card (Account Identity) */}
      <button
        type="button"
        onClick={() => router.push("/profile")}
        className="flex items-center gap-3.5 rounded-2xl bg-surface-container-low/80 border border-border/60 p-4 text-left hover:bg-surface-container transition-all active:scale-[0.99] shadow-xs"
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-accent/15 text-brand-accent font-bold text-lg">
          {user.fullName ? user.fullName.charAt(0).toUpperCase() : <UserCircle size={24} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-base font-bold text-on-surface">{user.fullName || "My Account"}</p>
            <span className="shrink-0 inline-flex items-center rounded-full bg-brand-accent/10 px-2 py-0.5 text-[10px] font-semibold text-brand-accent uppercase tracking-wider">
              {roleLabel}
            </span>
          </div>
          <p className="truncate text-xs text-on-surface-muted mt-0.5">Manage profile & account details</p>
        </div>
        <ChevronRight size={20} className="shrink-0 text-on-surface-muted" aria-hidden />
      </button>

      {/* 2. Appearance & Display (Directly below Profile for instant comfort access) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-surface-container-low/80 border border-border/60 p-3.5 sm:p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-accent/10 text-brand-accent">
            <Sun size={20} aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-[length:var(--font-size-body-lg)] font-medium text-on-surface">Appearance</p>
            <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">Theme display mode</p>
          </div>
        </div>
        <div className="flex justify-start sm:justify-end">
          <ThemeToggle variant="capsule-pill" />
        </div>
      </div>

      {/* 3. Team & Staff Management (Operational Priority #1 for Owners) */}
      {canManageBusiness && (
        <div className="flex flex-col gap-1.5">
          <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-on-surface-muted">
            Team & Staff
          </p>
          <div className="flex flex-col rounded-2xl bg-surface-container-low/80 border border-border/60 divide-y divide-border/40 overflow-hidden shadow-xs">
            <SettingsRow
              icon={Users}
              label="Staff & Access"
              description="Add cashiers, workers & manage permissions"
              tone="warning"
              onClick={() => router.push("/staff")}
            />
          </div>
        </div>
      )}

      {/* 4. Business & Locations (Operational Priority #2) */}
      {canManageBusiness && (
        <div className="flex flex-col gap-1.5">
          <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-on-surface-muted">
            Business & Outlets
          </p>
          <div className="flex flex-col rounded-2xl bg-surface-container-low/80 border border-border/60 divide-y divide-border/40 overflow-hidden shadow-xs">
            <SettingsRow
              icon={Store}
              label="Business Details"
              description="Store name, receipt headers & contact info"
              tone="brand"
              onClick={() => router.push("/settings/business")}
            />
            <SettingsRow
              icon={GitBranch}
              label="Branches & Outlets"
              description="Store locations & staff assignments"
              tone="neutral"
              onClick={() => router.push("/settings/branches")}
            />
          </div>
        </div>
      )}

      {/* 5. Data & Offline Reliability (Operational Priority #3) */}
      {canManageBusiness && (
        <div className="flex flex-col gap-1.5">
          <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-on-surface-muted">
            Data & System
          </p>
          <div className="flex flex-col rounded-2xl bg-surface-container-low/80 border border-border/60 divide-y divide-border/40 overflow-hidden shadow-xs">
            <SettingsRow
              icon={DatabaseBackup}
              label="Data & Backup"
              description="Sync health, outbox queue & local backup"
              tone="success"
              onClick={() => router.push("/settings/data")}
            />
            <SettingsRow
              icon={Share2}
              label="WhatsApp Reports"
              description="Automated daily sales & register close summary"
              tone="success"
              onClick={() => router.push("/settings/sharing")}
            />
          </div>
        </div>
      )}

      {/* 6. Support & About */}
      <div className="flex flex-col gap-1.5">
        <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-on-surface-muted">
          Support & Info
        </p>
        <div className="flex flex-col rounded-2xl bg-surface-container-low/80 border border-border/60 divide-y divide-border/40 overflow-hidden shadow-xs">
          <SettingsRow
            icon={HelpCircle}
            label="Help & Support"
            description="User guides, offline FAQs & feedback"
            tone="neutral"
            onClick={() => router.push("/settings/help")}
          />
          <SettingsRow
            icon={Info}
            label="About StockPadi"
            description="Version 0.1.0 • Offline-first architecture"
            tone="neutral"
            onClick={() => router.push("/settings/about")}
          />
        </div>
      </div>

      {/* 7. Exit / Logout Action */}
      <div className="pt-2">
        <button
          type="button"
          onClick={handleLogout}
          className="relative flex min-h-[var(--touch-target-min)] w-full items-center gap-3 overflow-hidden rounded-2xl bg-danger-container/30 border border-danger/20 px-4 py-3.5 text-left hover:bg-danger-container/50 active:scale-[0.99] transition-all shadow-xs"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
            <LogOut size={20} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[length:var(--font-size-body-lg)] font-semibold text-danger">Log out</p>
            <p className="truncate text-[length:var(--font-size-caption)] text-on-surface-muted">Sign out of this device</p>
          </div>
        </button>
      </div>
    </div>
  );
}
