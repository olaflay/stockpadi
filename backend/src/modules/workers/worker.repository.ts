import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "../../shared/errors/http-error.js";

export interface StaffListItem {
  id: string;
  fullName: string;
  accountType: "BUSINESS_OWNER" | "WORKER";
  status: string;
  isActive: boolean;
  branchIds: string[];
}

/** Returns only people belonging to the already-resolved tenant. */
export async function listBusinessStaff(db: SupabaseClient, businessId: string): Promise<StaffListItem[]> {
  const { data: memberships, error: membershipError } = await db
    .from("business_memberships")
    .select("user_id, account_type, status")
    .eq("business_id", businessId)
    .in("account_type", ["BUSINESS_OWNER", "WORKER"]);
  if (membershipError) throw new HttpError(500, "STAFF_LOAD_FAILED", membershipError.message);
  if (!memberships?.length) return [];

  const ids = memberships.map((membership) => membership.user_id as string);
  const { data: profiles, error: profileError } = await db
    .from("users")
    .select("id, full_name, account_type, is_active")
    .eq("business_id", businessId)
    .in("id", ids);
  if (profileError) throw new HttpError(500, "STAFF_LOAD_FAILED", profileError.message);

  const { data: assignments, error: branchError } = await db
    .from("user_branches")
    .select("user_id, branch_id")
    .eq("business_id", businessId)
    .in("user_id", ids);
  if (branchError) throw new HttpError(500, "STAFF_LOAD_FAILED", branchError.message);

  const profileById = new Map((profiles ?? []).map((profile) => [profile.id as string, profile]));
  const branchesByUser = new Map<string, string[]>();
  for (const assignment of assignments ?? []) {
    const current = branchesByUser.get(assignment.user_id as string) ?? [];
    current.push(assignment.branch_id as string);
    branchesByUser.set(assignment.user_id as string, current);
  }

  return memberships
    .map((membership) => {
      const profile = profileById.get(membership.user_id as string);
      if (!profile) return null;
      return {
        id: profile.id as string,
        fullName: profile.full_name as string,
        accountType: membership.account_type as "BUSINESS_OWNER" | "WORKER",
        status: membership.status as string,
        isActive: Boolean(profile.is_active) && membership.status === "active",
        branchIds: branchesByUser.get(profile.id as string) ?? [],
      };
    })
    .filter((item): item is StaffListItem => item !== null)
    .sort((a, b) => (a.accountType === "BUSINESS_OWNER" ? -1 : b.accountType === "BUSINESS_OWNER" ? 1 : a.fullName.localeCompare(b.fullName)));
}

export async function getBusinessStaffMember(db: SupabaseClient, businessId: string, userId: string) {
  const member = (await listBusinessStaff(db, businessId)).find((item) => item.id === userId);
  if (!member) throw new HttpError(404, "NOT_FOUND", "Staff member not found");
  return member;
}

export async function listStaffAudit(db: SupabaseClient, businessId: string) {
  const { data, error } = await db.from("audit_logs").select("id, action, entity_type, entity_id, actor_user_id, after_state, created_at").eq("business_id", businessId).order("created_at", { ascending: false }).limit(100);
  if (error) throw new HttpError(500, "AUDIT_LOAD_FAILED", error.message);
  return data ?? [];
}

export async function businessName(db: SupabaseClient, businessId: string) {
  const { data, error } = await db.from("business_profile").select("name").eq("id", businessId).maybeSingle();
  if (error || !data) throw new HttpError(404, "BUSINESS_NOT_FOUND", "Business was not found");
  return data.name as string;
}

export async function validateBranch(db: SupabaseClient, businessId: string, branchId?: string | null) {
  if (!branchId) return;
  const { data, error } = await db.from("branches").select("id").eq("id", branchId).eq("business_id", businessId).maybeSingle();
  if (error || !data) throw new HttpError(400, "INVALID_BRANCH", "Branch does not belong to this business");
}

export async function validateCapacity(db: SupabaseClient, businessId: string) {
  const { count, error } = await db.from("business_memberships").select("user_id", { count: "exact", head: true }).eq("business_id", businessId).eq("account_type", "WORKER").eq("status", "active");
  if (error) throw new HttpError(500, "CAPACITY_CHECK_FAILED", error.message);
  if ((count ?? 0) >= 3) throw new HttpError(409, "STAFF_CAP_REACHED", "Only 3 workers are allowed on top of the owner");
}

export async function createWorkerRecords(db: SupabaseClient, input: { userId: string; businessId: string; fullName: string; branchId?: string | null }) {
  const profile = await db.from("users").insert({ id: input.userId, business_id: input.businessId, full_name: input.fullName, account_type: "WORKER", is_active: true });
  if (profile.error) throw new Error(`PROFILE_FAILED:${profile.error.message}`);
  const membership = await db.from("business_memberships").insert({ user_id: input.userId, business_id: input.businessId, type: "worker", account_type: "WORKER", status: "active" });
  if (membership.error) throw new Error(`MEMBERSHIP_FAILED:${membership.error.message}`);
  if (input.branchId) {
    const branch = await db.from("user_branches").insert({ user_id: input.userId, branch_id: input.branchId, business_id: input.businessId });
    if (branch.error) throw new Error(`BRANCH_FAILED:${branch.error.message}`);
  }
}

export async function removeWorkerRecords(db: SupabaseClient, userId: string, businessId: string) {
  for (const result of [
    await db.from("user_branches").delete().eq("user_id", userId).eq("business_id", businessId),
    await db.from("business_memberships").delete().eq("user_id", userId).eq("business_id", businessId),
    await db.from("users").delete().eq("id", userId).eq("business_id", businessId),
  ]) if (result.error) throw new Error(result.error.message);
}

export async function writeAudit(db: SupabaseClient, actorId: string, businessId: string, action: string, entityId: string, state: unknown) {
  const { error } = await db.from("audit_logs").insert({ business_id: businessId, actor_user_id: actorId, action, entity_type: "users", entity_id: entityId, before_state: null, after_state: state });
  if (error) throw new Error(error.message);
}
