import type { SupabaseClient } from "@supabase/supabase-js";
import { WORKER_CAPABILITIES, type WorkerCapability } from "@stockpadi/contracts";
import { HttpError } from "../../shared/errors/http-error.js";

export interface StaffListItem {
  id: string;
  fullName: string;
  email: string | null;
  accountType: "BUSINESS_OWNER" | "WORKER";
  status: string;
  isActive: boolean;
  deactivatedAt: string | null;
  branchIds: string[];
  capabilities: WorkerCapability[];
  managerBranchIds: string[];
}

/** Returns only people belonging to the already-resolved tenant. */
export async function listBusinessStaff(db: SupabaseClient, businessId: string): Promise<StaffListItem[]> {
  const { data: memberships, error: membershipError } = await db
    .from("business_memberships")
    .select("user_id, account_type, status")
    .eq("business_id", businessId)
    .in("account_type", ["BUSINESS_OWNER", "WORKER"])
    .in("status", ["active", "disabled"]);
  if (membershipError) throw new HttpError(500, "STAFF_LOAD_FAILED", membershipError.message);
  if (!memberships?.length) return [];

  const ids = memberships.map((membership) => membership.user_id as string);
  const { data: profiles, error: profileError } = await db
    .from("users")
    .select("id, full_name, email, account_type, is_active, deactivated_at")
    .eq("business_id", businessId)
    .in("id", ids);
  if (profileError) throw new HttpError(500, "STAFF_LOAD_FAILED", profileError.message);

  const { data: assignments, error: branchError } = await db
    .from("user_branches")
    .select("user_id, branch_id, is_manager")
    .eq("business_id", businessId)
    .in("user_id", ids);
  if (branchError) throw new HttpError(500, "STAFF_LOAD_FAILED", branchError.message);
  const { data: grants, error: grantsError } = await db.from("worker_permissions").select("user_id, permission").eq("business_id", businessId).eq("enabled", true).in("user_id", ids);
  if (grantsError) throw new HttpError(500, "STAFF_LOAD_FAILED", grantsError.message);

  const profileById = new Map((profiles ?? []).map((profile) => [profile.id as string, profile]));
  const branchesByUser = new Map<string, string[]>();
  const managersByUser = new Map<string, string[]>();
  for (const assignment of assignments ?? []) {
    const current = branchesByUser.get(assignment.user_id as string) ?? [];
    current.push(assignment.branch_id as string);
    branchesByUser.set(assignment.user_id as string, current);
    if (assignment.is_manager) {
      const managers = managersByUser.get(assignment.user_id as string) ?? [];
      managers.push(assignment.branch_id as string);
      managersByUser.set(assignment.user_id as string, managers);
    }
  }
  const capabilitiesByUser = new Map<string, WorkerCapability[]>();
  for (const grant of grants ?? []) {
    if (!(grant.permission as string) || !(WORKER_CAPABILITIES as readonly string[]).includes(grant.permission as string)) continue;
    capabilitiesByUser.set(grant.user_id as string, [...(capabilitiesByUser.get(grant.user_id as string) ?? []), grant.permission as WorkerCapability]);
  }

  return memberships
    .map((membership) => {
      const profile = profileById.get(membership.user_id as string);
      if (!profile) return null;
      return {
        id: profile.id as string,
        fullName: profile.full_name as string,
        email: (profile.email as string | null) ?? null,
        accountType: membership.account_type as "BUSINESS_OWNER" | "WORKER",
        status: membership.status as string,
        isActive: Boolean(profile.is_active) && membership.status === "active",
        deactivatedAt: (profile.deactivated_at as string | null) ?? null,
        branchIds: branchesByUser.get(profile.id as string) ?? [],
        capabilities: capabilitiesByUser.get(profile.id as string) ?? [],
        managerBranchIds: managersByUser.get(profile.id as string) ?? [],
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

export async function findWorkerByEmail(db: SupabaseClient, businessId: string, email: string) {
  const { data, error } = await db
    .from("users")
    .select("id, business_id, account_type, is_active, deactivated_at, permanently_deleted_at")
    .eq("business_id", businessId)
    .eq("account_type", "WORKER")
    .ilike("email", email)
    .maybeSingle();
  if (error) throw new HttpError(500, "STAFF_LOOKUP_FAILED", error.message);
  return data as { id: string; business_id: string; account_type: "WORKER"; is_active: boolean; deactivated_at: string | null; permanently_deleted_at: string | null } | null;
}

const WORKER_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function isWorkerRetentionExpired(deactivatedAt: string | null | undefined, now = Date.now()): boolean {
  return Boolean(deactivatedAt && now - Date.parse(deactivatedAt) >= WORKER_RETENTION_MS);
}

function tombstoneEmail(userId: string): string {
  return `deleted-worker+${userId}@deleted.stockpadi.app`;
}

/** Retire the login but retain its user id for historical records. */
export async function permanentlyRetireWorker(db: SupabaseClient, userId: string, businessId: string): Promise<void> {
  const authUpdate = await db.auth.admin.updateUserById(userId, {
    email: tombstoneEmail(userId),
    email_confirm: true,
    password: `${crypto.randomUUID()}-Retired!`,
  });
  if (authUpdate.error) throw new HttpError(500, "WORKER_RETIREMENT_FAILED", authUpdate.error.message);

  const retiredAt = new Date().toISOString();
  const permissions = await db.from("worker_permissions").delete().eq("user_id", userId).eq("business_id", businessId);
  if (permissions.error) throw new HttpError(500, "WORKER_RETIREMENT_FAILED", permissions.error.message);
  const branches = await db.from("user_branches").delete().eq("user_id", userId).eq("business_id", businessId);
  if (branches.error) throw new HttpError(500, "WORKER_RETIREMENT_FAILED", branches.error.message);
  const membership = await db.from("business_memberships").update({ status: "revoked", updated_at: retiredAt }).eq("user_id", userId).eq("business_id", businessId);
  if (membership.error) throw new HttpError(500, "WORKER_RETIREMENT_FAILED", membership.error.message);
  const profile = await db.from("users").update({
    email: null,
    full_name: "Deleted worker",
    is_active: false,
    deactivated_at: null,
    permanently_deleted_at: retiredAt,
    updated_at: retiredAt,
  }).eq("id", userId).eq("business_id", businessId);
  if (profile.error) throw new HttpError(500, "WORKER_RETIREMENT_FAILED", profile.error.message);
}

export async function purgeExpiredDeactivatedWorkers(db: SupabaseClient, businessId: string): Promise<void> {
  const cutoff = new Date(Date.now() - WORKER_RETENTION_MS).toISOString();
  const { data, error } = await db
    .from("users")
    .select("id")
    .eq("business_id", businessId)
    .eq("account_type", "WORKER")
    .eq("is_active", false)
    .is("permanently_deleted_at", null)
    .not("deactivated_at", "is", null)
    .lt("deactivated_at", cutoff)
    .limit(50);
  if (error) throw new HttpError(500, "WORKER_RETIREMENT_FAILED", error.message);
  for (const worker of data ?? []) await permanentlyRetireWorker(db, worker.id as string, businessId);
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

export async function createWorkerRecords(db: SupabaseClient, input: { userId: string; businessId: string; fullName: string; email: string; branchId?: string | null; capabilities: WorkerCapability[] }) {
  const profile = await db.from("users").insert({ id: input.userId, business_id: input.businessId, full_name: input.fullName, email: input.email, account_type: "WORKER", is_active: true, deactivated_at: null, permanently_deleted_at: null });
  if (profile.error) throw new Error(`PROFILE_FAILED:${profile.error.message}`);
  const membership = await db.from("business_memberships").insert({ user_id: input.userId, business_id: input.businessId, type: "worker", account_type: "WORKER", status: "active" });
  if (membership.error) throw new Error(`MEMBERSHIP_FAILED:${membership.error.message}`);
  if (input.branchId) {
    const branch = await db.from("user_branches").insert({ user_id: input.userId, branch_id: input.branchId, business_id: input.businessId });
    if (branch.error) throw new Error(`BRANCH_FAILED:${branch.error.message}`);
  }
  if (input.capabilities.length > 0) {
    const grants = await db.from("worker_permissions").insert(input.capabilities.map((permission) => ({ user_id: input.userId, business_id: input.businessId, permission, enabled: true })));
    if (grants.error) throw new Error(`PERMISSIONS_FAILED:${grants.error.message}`);
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
