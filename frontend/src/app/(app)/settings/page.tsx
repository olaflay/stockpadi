"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, ChevronRight, ShieldCheck } from "lucide-react";
import { getBrandingConfig } from "@/config/branding";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SettingsRow } from "@/components/ui/SettingsRow";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useCurrentUser, hasAccountType } from "@/features/auth/use-current-user";
import { useTheme } from "@/features/settings/use-theme";
import { signOut } from "@/features/auth/logout";
import { RippleButton, RippleLink } from "@/components/ui/Ripple";
import { Modal } from "@/components/ui/Modal";

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
  const branding = getBrandingConfig();
  const canManageBusiness = hasAccountType(user, CAN_MANAGE_BUSINESS_SETTINGS);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);

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
      <ScreenHeader title="Settings" backHref="/more" />

      {/* Account Identity Header — Clean profile surface */}
      <RippleLink
        href="/profile"
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
        <ChevronRight size={18} className="shrink-0 text-on-surface-muted" aria-hidden />
      </RippleLink>

      {/* Appearance Section */}
      <section className="flex flex-col">
        <h2 className="px-1 pb-2 text-[12px] font-semibold uppercase tracking-wider text-on-surface-muted">
          Display
        </h2>
        {(() => {
          const themeSubtitle =
            theme === "system"
              ? "System default (light & dark)"
              : theme === "dark"
                ? "Dark mode"
                : "Light mode";

          return (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-container p-4">
              <div className="min-w-0">
                <p className="text-[length:var(--font-size-body)] font-semibold text-on-surface truncate">Appearance</p>
                <p className="text-[length:var(--font-size-caption)] text-on-surface-muted truncate mt-0.5">{themeSubtitle}</p>
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
              label="Staff and access"
              description="Add cashiers, workers and manage permissions"
              href="/staff"
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
              href="/settings/business"
            />
            <SettingsRow
              label="Branches and outlets"
              description="Store locations and staff assignments"
              href="/settings/branches"
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
              href="/settings/data"
            />
            <SettingsRow
              label="Sync and system health"
              description="Cloud connection, pull completeness and pending changes"
              href="/settings/sync-health"
            />
            <SettingsRow
              label="WhatsApp reports"
              description="Automated daily sales and register close summary"
              href="/settings/sharing"
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
            label="App Walkthrough"
            description="Replay the interactive guided tour"
            onClick={() => {
              window.localStorage.removeItem(`stockpadi.guided-tour.v2:${user.id}`);
              window.dispatchEvent(new Event("stockpadi-tour-change"));
              router.push("/dashboard");
            }}
          />
          <SettingsRow
            label="Help & Support"
            description="User guides, offline FAQs & feedback"
            href="/settings/help"
          />
          <SettingsRow
            label={`About ${branding.businessName}`}
            description="Version 0.1.0 • Offline-first architecture"
            onClick={() => setIsAboutModalOpen(true)}
          />
        </div>
      </section>

      {/* Exit / Logout Action */}
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
        </RippleButton>
      </section>

      {/* Instant About Modal */}
      {isAboutModalOpen && (
        <Modal
          title={`About ${branding.businessName}`}
          isOpen={isAboutModalOpen}
          onClose={() => setIsAboutModalOpen(false)}
        >
          <div className="flex flex-col gap-4 text-left">
            <div className="rounded-2xl bg-surface-container p-4">
              <p className="text-[length:var(--font-size-body-lg)] font-bold text-on-surface">{branding.businessName}</p>
              <p className="text-[length:var(--font-size-caption)] text-on-surface-muted mt-0.5">
                Version 0.1.0 • Offline-first retail inventory and point-of-sale.
              </p>
            </div>

            <section className="flex items-start gap-3 rounded-2xl bg-surface-container p-4">
              <ShieldCheck size={20} className="mt-0.5 shrink-0 text-brand-accent" aria-hidden />
              <p className="text-[length:var(--font-size-caption)] leading-relaxed text-on-surface-muted">
                <strong className="text-on-surface font-semibold">NDPR Compliance Statement:</strong> All sales, inventory, and staff data are stored locally in IndexedDB on this device. No information is transmitted to external servers unless synchronizing with your secure business database.
              </p>
            </section>

            <RippleButton
              type="button"
              onClick={() => setIsAboutModalOpen(false)}
              className="mt-2 w-full rounded-2xl bg-brand-accent py-3 text-sm font-semibold text-brand-accent-contrast hover:opacity-90 transition-opacity"
            >
              Close
            </RippleButton>
          </div>
        </Modal>
      )}
    </div>
  );
}
