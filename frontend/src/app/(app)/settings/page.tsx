"use client";

import { useRouter } from "next/navigation";
import { UserCircle, Store, Users, GitBranch, Share2, DatabaseBackup, Info, HelpCircle, LogOut } from "lucide-react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SettingsRow } from "@/components/ui/SettingsRow";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useCurrentUser, hasAccountType } from "@/features/auth/use-current-user";
import { signOut } from "@/features/auth/logout";

/**
 * Grouped settings list — Profile and Appearance are universal, then
 * owner-only business rows, then support and the Log out action for
 * everyone. Rows are hidden by role so a Worker (or Admin) never taps into
 * a destination that would only show PermissionDenied. Destinations still
 * enforce their own guard server-side. docs/RESEARCH-AND-PLAN.md Phase 2
 * item 17.
 */
const CAN_MANAGE_BUSINESS_SETTINGS = ["BUSINESS_OWNER"] as const;

export default function SettingsPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const canManageBusiness = hasAccountType(user, CAN_MANAGE_BUSINESS_SETTINGS);

  async function handleLogout() {
    await signOut();
    router.replace("/login?force=true");
  }

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title="Settings" hideBack={true} />

      <div className="flex flex-col gap-1">
        <SettingsRow
          icon={UserCircle}
          label="Profile"
          description={user.fullName}
          tone="brand"
          onClick={() => router.push("/profile")}
        />
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-4 px-4">
        <p className="text-[length:var(--font-size-label)] text-on-surface-muted">Appearance</p>
        <ThemeToggle />
      </div>

      {canManageBusiness && (
        <>
          <div className="flex flex-col border-t border-border pt-4 px-4">
            <p className="mb-2 text-[length:var(--font-size-label)] text-on-surface-muted">Business</p>
            <div className="-mx-4 flex flex-col gap-1">
              <SettingsRow
                icon={Store}
                label="Business"
                description="Business name, address & details"
                tone="brand"
                onClick={() => router.push("/settings/business")}
              />
              <SettingsRow
                icon={Users}
                label="Staff & Access"
                description="Add workers & manage permissions"
                tone="warning"
                onClick={() => router.push("/staff")}
              />
              <SettingsRow
                icon={GitBranch}
                label="Branches"
                description="Locations & staff assignments"
                tone="neutral"
                onClick={() => router.push("/settings/branches")}
              />
            </div>
          </div>

          <div className="flex flex-col border-t border-border pt-4 px-4">
            <p className="mb-2 text-[length:var(--font-size-label)] text-on-surface-muted">Sharing & Data</p>
            <div className="-mx-4 flex flex-col gap-1">
              <SettingsRow
                icon={Share2}
                label="Sharing"
                description="WhatsApp number for sending reports"
                tone="success"
                onClick={() => router.push("/settings/sharing")}
              />
              <SettingsRow
                icon={DatabaseBackup}
                label="Data & Backup"
                description="Backup, restore & retry syncs"
                tone="success"
                onClick={() => router.push("/settings/data")}
              />
            </div>
          </div>
        </>
      )}

      <div className="flex flex-col border-t border-border pt-4 px-4">
        <p className="mb-2 text-[length:var(--font-size-label)] text-on-surface-muted">Support</p>
        <div className="-mx-4 flex flex-col gap-1">
          <SettingsRow
            icon={HelpCircle}
            label="Help & Support"
            description="Guides, FAQs & feedback"
            tone="neutral"
            onClick={() => router.push("/settings/help")}
          />
          <SettingsRow
            icon={Info}
            label="About"
            description="App info & privacy"
            tone="neutral"
            onClick={() => router.push("/settings/about")}
          />
        </div>
      </div>

      <div className="flex flex-col border-t border-border pt-4 px-4">
        <p className="mb-2 text-[length:var(--font-size-label)] text-on-surface-muted">Account</p>
        <div className="-mx-4 flex flex-col gap-1">
          <button
            type="button"
            onClick={handleLogout}
            className="relative flex min-h-[var(--touch-target-min)] w-full items-center gap-3 overflow-hidden rounded-[var(--radius-card)] px-4 py-3 text-left hover:bg-danger-container transition-colors"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
              <LogOut size={20} aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[length:var(--font-size-body-lg)] text-on-surface">Log out</p>
              <p className="truncate text-[length:var(--font-size-caption)] text-on-surface-muted">Sign out of this device</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
