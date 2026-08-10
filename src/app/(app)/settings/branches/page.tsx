"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { ErrorState } from "@/components/ui/ErrorState";
import { useToast } from "@/components/ui/Toast";
import { RippleButton } from "@/components/ui/Ripple";
import { useCurrentUser, hasRole } from "@/features/auth/use-current-user";
import { assertPermission } from "@/features/auth/assert-permission";

export default function BranchesSettingsPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const { showToast } = useToast();
  const [newBranchName, setNewBranchName] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const branches = useLiveQuery(async () => {
    try {
      const result = await db.branches.toArray();
      setLoadError(null);
      return result;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load branches.");
      return [];
    }
  }, []);

  if (!hasRole(user, ["owner", "admin"])) {
    return (
      <div>
        <ScreenHeader title="Branches" onBack={() => router.push("/settings")} />
        <PermissionDenied requiredRoles={["owner", "admin"]} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div>
        <ScreenHeader title="Branches" onBack={() => router.push("/settings")} />
        <ErrorState message="Couldn't load branches." onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (branches === undefined) {
    return (
      <div>
        <ScreenHeader title="Branches" onBack={() => router.push("/settings")} />
        <Skeleton className="h-40" />
      </div>
    );
  }

  async function addBranch() {
    if (!newBranchName.trim() || branches!.length === 6) return;
    await assertPermission(user, "change_settings");
    await db.branches.add({ id: crypto.randomUUID(), name: newBranchName.trim(), isActive: true });
    showToast(`${newBranchName.trim()} added`, "success");
    setNewBranchName("");
  }

  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader title={`Branches (${branches.length}/6)`} onBack={() => router.push("/settings")} />

      <ul className="flex flex-col gap-2">
        {branches.map((branch) => (
          <li
            key={branch.id}
            className="rounded-[var(--radius-card)] border border-border px-4 py-3 text-[length:var(--font-size-body)] text-on-surface"
          >
            {branch.name}
          </li>
        ))}
      </ul>

      {branches.length < 6 && (
        <div className="flex gap-2">
          <input
            value={newBranchName}
            onChange={(event) => setNewBranchName(event.target.value)}
            placeholder="New branch name"
            className="min-h-[var(--touch-target-min)] flex-1 rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[length:var(--font-size-body)] text-on-surface"
          />
          <RippleButton
            type="button"
            onClick={addBranch}
            className="flex min-h-[var(--touch-target-min)] items-center justify-center rounded-[var(--radius-control)] bg-brand-accent px-4 text-brand-accent-contrast hover:opacity-95 transition-opacity"
            aria-label="Add branch"
          >
            <Plus size={20} aria-hidden />
          </RippleButton>
        </div>
      )}
    </div>
  );
}
