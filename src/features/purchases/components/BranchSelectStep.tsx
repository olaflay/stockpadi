"use client";

import { useRouter } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import type { LocalBranch } from "@/lib/db";

export function BranchSelectStep({
  branches,
  onSelectBranch,
}: {
  branches: LocalBranch[];
  onSelectBranch: (branchId: string) => void;
}) {
  const router = useRouter();

  if (branches.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No branches yet"
        description="Add a branch in Settings before updating stock."
        action={{ label: "Add a branch", onClick: () => router.push("/settings/branches") }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[length:var(--font-size-label)] text-on-surface-muted">Which branch?</p>
      {branches.map((branch) => (
        <button
          key={branch.id}
          type="button"
          onClick={() => onSelectBranch(branch.id)}
          className="min-h-[var(--touch-target-min)] rounded-[var(--radius-card)] border border-border px-4 py-3 text-left text-[length:var(--font-size-body-lg)] text-on-surface hover:bg-surface-container transition-colors"
        >
          {branch.name}
        </button>
      ))}
    </div>
  );
}
