"use client";

import { useRouter } from "next/navigation";
import { UserCircle, Store, Users, GitBranch, Share2, DatabaseBackup, Info, HelpCircle } from "lucide-react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SettingsRow } from "@/components/ui/SettingsRow";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useCurrentUser } from "@/features/auth/use-current-user";

/**
 * Grouped list — Profile at the top, then Business, Staff & Access,
 * Branches, Sharing, Data & Backup, About. Every row tappable, every row
 * leading somewhere; individual destinations gate themselves rather than
 * the whole list hiding rows. docs/RESEARCH-AND-PLAN.md Phase 2 item 17.
 */
export default function SettingsPage() {
  const router = useRouter();
  const user = useCurrentUser();

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

      <div className="flex flex-col gap-1 border-t border-border pt-2">
        <SettingsRow icon={Store} label="Business" tone="brand" onClick={() => router.push("/settings/business")} />
        <SettingsRow icon={Users} label="Staff & Access" tone="warning" onClick={() => router.push("/staff")} />
        <SettingsRow icon={GitBranch} label="Branches" tone="neutral" onClick={() => router.push("/settings/branches")} />
        <SettingsRow icon={Share2} label="Sharing" tone="success" onClick={() => router.push("/settings/sharing")} />
        <SettingsRow icon={DatabaseBackup} label="Data & Backup" tone="success" onClick={() => router.push("/settings/data")} />
        <SettingsRow icon={HelpCircle} label="Help & Support" tone="neutral" onClick={() => router.push("/settings/help")} />
        <SettingsRow icon={Info} label="About" tone="neutral" onClick={() => router.push("/settings/about")} />
      </div>
    </div>
  );
}
