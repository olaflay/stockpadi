"use client";

import { useRouter } from "next/navigation";
import { ChevronRight, Sun, Moon, SunMoon, Users, LogOut } from "lucide-react";
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
        className="flex items-center justify-between gap-3.5 rounded-2xl bg-surface-container px-4 py-3.5 text-left hover:bg-surface-container-high transition-colors active:scale-[0.99]"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-base font-bold text-on-surface">{user.fullName || "My Account"}</p>
            <span className="shrink-0 inline-flex items-center rounded-full bg-brand-container px-2 py-0.5 text-[10px] font-semibold text-on-brand-container uppercase tracking-wider">
              {roleLabel}
            </span>
          </div>
          <p className="truncate text-xs text-on-surface-muted mt-0.5">Manage profile & account details</p>
        </div>
        <ChevronRight size={18} className="shrink-0 text-on-surface-muted/60" aria-hidden />
      </RippleButton>

      {/* Appearance Section */}
      <section className="flex flex-col">
        <h2 className="px-1 pb-2 text-[12px] font-semibold uppercase tracking-wider text-on-surface-muted">
          Display
        </h2>
        {(() => {
          const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : SunMoon;
          const themeSubtitle =
            theme === "system"
              ? "System default (light & dark)"
              : theme === "dark"
              ? "Dark mode"
              : "Light mode";

          return (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-container p-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-container text-on-brand-container transition-colors">
                  <ThemeIcon size={20} aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-[length:var(--font-size-body)] font-semibold text-on-surface truncate">Appearance</p>
                  <p className="text-[length:var(--font-size-caption)] text-on-surface-muted truncate mt-0.5">{themeSubtitle}</p>
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
          <div className="flex flex-col rounded-2xl bg-surface-container overflow-hidden">
            <SettingsRow
              icon={Users}
              label="Staff and access"
              description="Add cashiers, workers and manage permissions"
              tone="brand"
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
          <div className="flex flex-col rounded-2xl bg-surface-container overflow-hidden">
            <SettingsRow
              label="Business details"
              description="Store name, receipt headers and contact info"
              onClick={() => router.push("/settings/business")}
            />
            <SettingsRow
              label="Branches and outlets"
              description="Store locations and staff assignments"
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
          <div className="flex flex-col rounded-2xl bg-surface-container overflow-hidden">
            <SettingsRow
              label="Data and backup"
              description="Sync health, outbox queue and local backup"
              onClick={() => router.push("/settings/data")}
            />
            <SettingsRow
              label="WhatsApp reports"
              description="Automated daily sales and register close summary"
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
        <div className="flex flex-col rounded-2xl bg-surface-container overflow-hidden">
          <SettingsRow
            label="Help & Support"
            description="User guides, offline FAQs & feedback"
            onClick={() => router.push("/settings/help")}
          />
          <SettingsRow
            label="About StockPadi"
            description="Version 0.1.0 • Offline-first architecture"
            onClick={() => router.push("/settings/about")}
          />
        </div>
      </section>

      {/* Exit / Logout Action — Clean row at document bottom */}
      <section className="pt-2">
        <RippleButton
          type="button"
          onClick={handleLogout}
          className="relative flex min-h-[var(--touch-target-min)] w-full items-center justify-between gap-3 overflow-hidden rounded-2xl bg-surface-container px-4 py-3.5 text-left hover:bg-surface-container-high active:scale-[0.99] transition-colors"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-container text-on-danger-container">
            <LogOut size={20} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[length:var(--font-size-body-lg)] font-medium text-danger">Log out</p>
            <p className="truncate text-[length:var(--font-size-caption)] text-on-surface-muted mt-0.5">Sign out of this device</p>
          </div>
          <ChevronRight size={18} className="shrink-0 text-on-surface-muted/60" aria-hidden />
        </RippleButton>
      </section>
    </div>
  );
}
