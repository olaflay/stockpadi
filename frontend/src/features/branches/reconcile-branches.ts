import { db } from "@/lib/db";
import { getLocalBusinessId, tenantArray } from "@/lib/local-tenant";
import { serverGet } from "@/features/operations/server-client";

/**
 * Compatibility reader for older startup code. It deliberately never deletes
 * or rewrites an unknown branch reference. Branch identity is transactional
 * data; an invalid legacy ID is reported for quarantine/migration instead of
 * being reassigned to an arbitrary remote branch.
 */
export async function reconcileLocalBranches(): Promise<{
  reconciled: boolean;
  remoteCount: number;
  repairedOutboxCount: number;
  quarantinedBranchIds: string[];
}> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { reconciled: false, remoteCount: 0, repairedOutboxCount: 0, quarantinedBranchIds: [] };
  }
  const activeBusinessId = await getLocalBusinessId();
  if (!activeBusinessId) return { reconciled: false, remoteCount: 0, repairedOutboxCount: 0, quarantinedBranchIds: [] };

  const response = await serverGet<{ branches: Array<{ id: string; name: string; is_active: boolean; is_primary?: boolean; business_id: string }> }>("/api/businesses/branches");
  const remoteBranches = Array.isArray(response.branches) ? response.branches : [];
  const localBranches = await tenantArray(db.branches);
  const remoteIds = new Set(remoteBranches.map((branch) => branch.id));
  const quarantinedBranchIds = localBranches
    .map((branch) => branch.id)
    .filter((id) => !remoteIds.has(id));

  if (quarantinedBranchIds.length > 0) {
    await db.syncQuarantine.bulkPut(quarantinedBranchIds.map((entityId) => ({
      id: `${activeBusinessId}:branch:${entityId}`,
      businessId: activeBusinessId,
      entity: "branch",
      entityId,
      record: localBranches.find((branch) => branch.id === entityId) ?? null,
      reason: "Local branch is not present in the authoritative branch list.",
      createdAt: new Date().toISOString(),
    })));
  }

  if (remoteBranches.length > 0) await db.branches.bulkPut(remoteBranches.map((branch) => ({
    id: branch.id,
    name: branch.name,
    isActive: branch.is_active,
    isPrimary: branch.is_primary === true,
    businessId: branch.business_id,
  })));

  return { reconciled: true, remoteCount: remoteBranches.length, repairedOutboxCount: 0, quarantinedBranchIds };
}
