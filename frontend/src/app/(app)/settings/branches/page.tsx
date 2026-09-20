"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Archive, Check, Pencil, RotateCcw } from "lucide-react";
import { db, type LocalBranch } from "@/lib/db";
import { tenantArray } from "@/lib/local-tenant";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { ErrorState } from "@/components/ui/ErrorState";
import { useToast } from "@/components/ui/Toast";
import { RippleButton } from "@/components/ui/Ripple";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { writeBranchOffline, setPrimaryBranchOffline } from "@/features/branches/write-branch-offline";

export default function BranchesSettingsPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const { showToast } = useToast();
  const [newBranchName, setNewBranchName] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const branches = useLiveQuery(async () => {
    const result = await tenantArray(db.branches);
    setLoadError(null);
    return result;
  }, []);

  if (user.accountType !== "BUSINESS_OWNER") {
    return (
      <div>
        <ScreenHeader title="Branches" onBack={() => router.push("/settings")} />
        <PermissionDenied requiredAccountType="BUSINESS_OWNER" />
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
    if (!newBranchName.trim() || branches!.filter((branch) => branch.isActive).length === 6) return;
    const branch = { id: crypto.randomUUID(), name: newBranchName.trim(), isActive: true, isPrimary: branches!.every((candidate) => !candidate.isPrimary) };
    await writeBranchOffline(branch);
    showToast(`${newBranchName.trim()} added`, "success");
    setNewBranchName("");
  }

  async function renameBranch(branch: LocalBranch) {
    const name = window.prompt("Branch name", branch.name)?.trim();
    if (name && name !== branch.name) await writeBranchOffline({ ...branch, name });
  }

  async function setPrimary(branch: LocalBranch) {
    if (branch.isPrimary || !branch.isActive) return;
    await setPrimaryBranchOffline(branch, branches!);
    showToast(`${branch.name} is now primary`, "success");
  }

  async function toggleArchive(branch: LocalBranch) {
    if (branch.isActive && branch.isPrimary) {
      showToast("Choose another primary branch before archiving this one.", "warning");
      return;
    }
    if (branch.isActive && branches!.filter((candidate) => candidate.isActive).length <= 1) {
      showToast("Keep one active branch for this business.", "warning");
      return;
    }
    await writeBranchOffline({ ...branch, isActive: !branch.isActive });
    showToast(branch.isActive ? `${branch.name} archived` : `${branch.name} reactivated`, "success");
  }

  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader title={`Branches (${branches.length}/6)`} onBack={() => router.push("/settings")} />

      <ul className="flex flex-col gap-2">
        {branches.filter((branch) => branch.isActive).map((branch) => (
          <li
            key={branch.id}
            className="rounded-2xl bg-surface-container px-4 py-3 text-[length:var(--font-size-body)] text-on-surface"
          >
            <div className="flex items-center justify-between gap-3">
              <div><p>{branch.name}</p>{branch.isPrimary && <span className="text-xs text-brand-accent">Primary branch</span>}</div>
              <div className="flex items-center gap-1">
                {!branch.isPrimary && <RippleButton type="button" onClick={() => setPrimary(branch)} aria-label={`Set ${branch.name} as primary`} className="rounded-full p-2 text-brand-accent"><Check size={16} aria-hidden /></RippleButton>}
                <RippleButton type="button" onClick={() => renameBranch(branch)} aria-label={`Rename ${branch.name}`} className="rounded-full p-2 text-on-surface-muted"><Pencil size={16} aria-hidden /></RippleButton>
                {!branch.isPrimary && <RippleButton type="button" onClick={() => toggleArchive(branch)} aria-label={`Archive ${branch.name}`} className="rounded-full p-2 text-danger"><Archive size={16} aria-hidden /></RippleButton>}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {branches.some((branch) => !branch.isActive) && (
        <section className="rounded-2xl bg-surface-container p-3">
          <h2 className="mb-2 text-sm font-semibold text-on-surface">Archived branches</h2>
          {branches.filter((branch) => !branch.isActive).map((branch) => <div key={branch.id} className="flex items-center justify-between gap-2 border-b border-border py-2 text-sm text-on-surface-muted"><span>{branch.name}</span><RippleButton type="button" onClick={() => toggleArchive(branch)} className="flex items-center gap-1 rounded-full px-2 py-1 text-brand-accent"><RotateCcw size={14} aria-hidden /> Reactivate</RippleButton></div>)}
        </section>
      )}

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
