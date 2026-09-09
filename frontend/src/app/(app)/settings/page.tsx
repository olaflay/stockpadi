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
  Moon,
  Monitor,
  ChevronRight,
} from "lucide-react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SettingsRow } from "@/components/ui/SettingsRow";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useCurrentUser, hasAccountType } from "@/features/auth/use-current-user";
import { useTheme } from "@/features/settings/use-theme";
import { signOut } from "@/features/auth/logout";
import { RippleButton } from "@/components/ui/Ripple";

/**
 * Grouped settings document arranged by hierarchy of need per One UI / M3:
 * 1. User Profile & Account Identity (Clean top profile surface)
 * 2. Display / Appearance (Immediate viewing comfort)
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
  const { theme } = useTheme();
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
    <div className="flex flex-col gap-6 pb-12">
      <ScreenHeader title="Settings" hideBack={true} />

      {/* Account Identity Header — Clean profile surface, not an isolated floating card */}
      <RippleButton
        type="button"
        onClick={() => router.push("/profile")}
        className="flex items-center gap-3.5 rounded-2xl bg-surface-container-low px-4 py-3.5 text-left hover:bg-surface-container transition-colors active:scale-[0.99]"
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
      </RippleButton>

      {/* Appearance Section */}
      <section className="flex flex-col">
        <h2 className="px-1 pb-2 text-[12px] font-semibold uppercase tracking-wider text-on-surface-muted">
          Display
        </h2>
        {(() => {
          const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
          const themeSubtitle =
            theme === "system"
              ? "System default"
              : theme === "dark"
              ? "Dark mode"
              : "Light mode";

          return (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-container-low/60 border border-outline-variant/60 p-3 sm:p-3.5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-accent/10 text-brand-accent transition-colors">
                  <ThemeIcon size={18} aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-[length:var(--font-size-body)] font-semibold text-on-surface truncate">Appearance</p>
                  <p className="text-[length:var(--font-size-caption)] text-on-surface-muted truncate">{themeSubtitle}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center">
                <ThemeToggle variant="capsule-pill" />
              </div>
            </div>
          );
        })()}
      </section>

      {/* Team & Operations Section */}
      {canManageBusiness && (
        <section className="flex flex-col">
          <h2 className="px-1 pb-1 text-[12px] font-semibold uppercase tracking-wider text-on-surface-muted">
            Team & Operations
          </h2>
          <div className="flex flex-col divide-y divide-outline-variant/50 border-y border-outline-variant/60">
            <SettingsRow
              icon={Users}
              label="Staff & Access"
              description="Add cashiers, workers & manage permissions"
              tone="warning"
              onClick={() => router.push("/staff")}
            />
          </div>
        </section>
      )}

      {/* Business & Outlets Section */}
      {canManageBusiness && (
        <section className="flex flex-col">
          <h2 className="px-1 pb-1 text-[12px] font-semibold uppercase tracking-wider text-on-surface-muted">
            Business & Outlets
          </h2>
          <div className="flex flex-col divide-y divide-outline-variant/50 border-y border-outline-variant/60">
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
        </section>
      )}

      {/* Data & Backup Section */}
      {canManageBusiness && (
        <section className="flex flex-col">
          <h2 className="px-1 pb-1 text-[12px] font-semibold uppercase tracking-wider text-on-surface-muted">
            Data & System
          </h2>
          <div className="flex flex-col divide-y divide-outline-variant/50 border-y border-outline-variant/60">
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
        </section>
      )}

      {/* Support & About Section */}
      <section className="flex flex-col">
        <h2 className="px-1 pb-1 text-[12px] font-semibold uppercase tracking-wider text-on-surface-muted">
          Support & Info
        </h2>
        <div className="flex flex-col divide-y divide-outline-variant/50 border-y border-outline-variant/60">
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
      </section>

      {/* Exit / Logout Action — Clean row at document bottom */}
      <section className="pt-2">
        <RippleButton
          type="button"
          onClick={handleLogout}
          className="relative flex min-h-[var(--touch-target-min)] w-full items-center gap-3 overflow-hidden rounded-xl border border-danger/25 bg-danger/5 px-4 py-3 text-left hover:bg-danger/10 active:scale-[0.99] transition-colors"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger/15 text-danger">
            <LogOut size={18} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[length:var(--font-size-body)] font-semibold text-danger">Log out</p>
            <p className="truncate text-[length:var(--font-size-caption)] text-on-surface-muted">Sign out of this device</p>
          </div>
        </RippleButton>
      </section>
    </div>
  );
}
