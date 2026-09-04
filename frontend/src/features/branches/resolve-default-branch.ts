import type { CurrentUser } from "@/features/auth/use-current-user";

interface BranchLike {
  id: string;
}

/**
 * The single rule every flow uses to pick "which branch am I acting on"
 * when the user has not explicitly chosen one.
 *
 * - BUSINESS_OWNER / ADMIN: the first branch on the device. (Owners manage
 *   the whole business; screens that need better than "first branch" already
 *   offer an explicit picker, e.g. close day on multi-branch businesses.)
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
    return branches?.find((branch) => user.branchIds?.includes(branch.id))?.id;
  }
  return branches?.[0]?.id;
}