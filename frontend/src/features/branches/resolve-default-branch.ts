import type { CurrentUser } from "@/features/auth/use-current-user";

interface BranchLike {
  id: string;
  isActive?: boolean;
  isPrimary?: boolean;
}

/**
 * The single rule every flow uses to pick "which branch am I acting on"
 * when the user has not explicitly chosen one.
 *
 * - BUSINESS_OWNER / ADMIN: the active primary branch only. A missing primary
 *   is an explicit setup/data-integrity error; choosing the first row would
 *   make branch-sensitive writes nondeterministic across devices.
 * - WORKER: ONLY a branch they are assigned to. Returns undefined when the
 *   worker has no matching assignment so the caller can block rather than
 *   silently act on another branch — selling from an unassigned branch is
 *   rejected at sync, so surfacing it beats queueing unsyncable records.
 */
export function resolveDefaultBranch(
  branches: readonly BranchLike[] | undefined,
  user: Pick<CurrentUser, "accountType" | "branchIds">
): string | undefined {
  if (user.accountType === "WORKER") {
    return branches?.find((branch) => branch.isActive !== false && user.branchIds?.includes(branch.id))?.id;
  }
  const primary = branches?.find((branch) => branch.isActive !== false && branch.isPrimary);
  return primary?.id;
}
