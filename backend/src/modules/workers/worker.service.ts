import { HttpError } from "../../shared/errors/http-error.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountContext } from "../accounts/account-context.js";
import type { WorkerRequest } from "./worker.schema.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import { businessName, createWorkerRecords, findWorkerByEmail, getBusinessStaffMember, isWorkerRetentionExpired, listBusinessStaff, listStaffAudit, permanentlyRetireWorker, purgeExpiredDeactivatedWorkers, removeWorkerRecords, validateBranch, validateCapacity, writeAudit } from "./worker.repository.js";
import { generatePassword } from "./worker.password.js";
import { sendInvite, sendPassword } from "./worker.email.js";
import { requireAssignedBranch, requireCapability } from "../authorization/capabilities.js";

function canManageWorkers(context: AccountContext): boolean {
  return context.accountType === "BUSINESS_OWNER" || (context.accountType === "WORKER" && context.permissions.includes("MANAGE_BRANCH_WORKERS"));
}

export async function executeWorkerOperation(context: AccountContext, request: WorkerRequest): Promise<Record<string, unknown>> {
  if (!context.businessId || !canManageWorkers(context)) throw new HttpError(403, "FORBIDDEN", "This account cannot manage workers");
  const isOwner = context.accountType === "BUSINESS_OWNER";
  const db = supabaseAdmin();
  if (context.businessStatus !== "verified" && context.businessStatus !== "active") {
    throw new HttpError(403, "BUSINESS_NOT_READY", "Verify the business before adding Workers");
  }
  const name = await businessName(db, context.businessId);
  if (request.action === "create") {
    await purgeExpiredDeactivatedWorkers(db, context.businessId);
    const existingWorker = await findWorkerByEmail(db, context.businessId, request.email!);
    if (existingWorker) {
      if (!existingWorker.is_active) {
        throw new HttpError(409, "WORKER_DEACTIVATED", "This email belongs to a deactivated worker. Reactivate that worker from Staff instead of adding the same email.");
      }
      throw new HttpError(409, "EMAIL_ALREADY_REGISTERED", "A worker with this email already exists in this business.");
    }
    if (!request.branchId) throw new HttpError(400, "WORKER_REQUIRES_BRANCH", "Assign the worker to a branch before adding them");
    await validateBranch(db, context.businessId, request.branchId);
    if (!isOwner) requireAssignedBranch(context, request.branchId);
    await validateCapacity(db, context.businessId);
    const password = generatePassword(name);
    const { data, error } = await db.auth.admin.createUser({ email: request.email!, password, email_confirm: true, user_metadata: { full_name: request.fullName, account_type: "WORKER" } });
    if (error || !data.user) {
      if (error?.message && /already registered|already exists|duplicate/i.test(error.message)) {
        throw new HttpError(409, "EMAIL_ALREADY_REGISTERED", "An account with this email already exists. Reactivate the existing worker or use another email.");
      }
      throw new HttpError(409, "CREATE_FAILED", error?.message ?? "Could not create worker account");
    }
    try {
      await createWorkerRecords(db, { userId: data.user.id, businessId: context.businessId, fullName: request.fullName!, email: request.email!, branchId: request.branchId, capabilities: request.capabilities ?? [] });
      await writeAudit(db, context.userId, context.businessId, "staff_created", data.user.id, { accountType: "WORKER", email: request.email });
      await sendInvite(request.email!, request.fullName!);
      return { status: "ok", userId: data.user.id, email: request.email, password };
    } catch (cause) {
      try { await removeWorkerRecords(db, data.user.id, context.businessId); } catch (cleanup) { console.error("Worker database compensation failed", cleanup); }
      await db.auth.admin.deleteUser(data.user.id);
      throw new HttpError(500, "PROVISIONING_FAILED", cause instanceof Error ? cause.message : "Worker provisioning failed");
    }
  }
  if (!request.userId) throw new HttpError(400, "INVALID_BODY", "userId is required");
  const { data: target, error: targetError } = await db.from("users").select("id, account_type, is_active, deactivated_at, permanently_deleted_at").eq("id", request.userId).eq("business_id", context.businessId).maybeSingle();
  if (targetError || !target || target.account_type !== "WORKER") throw new HttpError(404, "NOT_FOUND", "Worker not found");
  if (target.permanently_deleted_at) throw new HttpError(410, "WORKER_RETIRED", "This worker was permanently retired after the 30-day reactivation window.");
  if (!isOwner) {
    const { data: targetBranches, error: targetBranchError } = await db.from("user_branches").select("branch_id").eq("business_id", context.businessId).eq("user_id", target.id);
    if (targetBranchError) throw new HttpError(500, "UPDATE_FAILED", targetBranchError.message);
    if (!(targetBranches ?? []).some((branch) => context.branchIds.includes(branch.branch_id as string))) throw new HttpError(403, "FORBIDDEN", "Worker is outside this manager's assigned branches");
  }
  if (request.action === "reset_password") {
    const { data: authTarget, error: authError } = await db.auth.admin.getUserById(target.id);
    if (authError || !authTarget.user?.email) throw new HttpError(409, "EMAIL_NOT_FOUND", "Worker email could not be found");
    const password = generatePassword(name);
    const updated = await db.auth.admin.updateUserById(target.id, { password });
    if (updated.error) throw new HttpError(500, "PASSWORD_UPDATE_FAILED", updated.error.message);
    try { await sendPassword(authTarget.user.email); } catch (error) { throw new HttpError(502, "MAIL_FAILED", `Password changed but notification delivery failed: ${error instanceof Error ? error.message : "email error"}`); }
    await writeAudit(db, context.userId, context.businessId, "password_reset", target.id, { delivery: "email" });
    return { status: "ok", password };
  }
  if (request.action === "reactivate" && isWorkerRetentionExpired(target.deactivated_at as string | null)) {
    await permanentlyRetireWorker(db, target.id as string, context.businessId);
    throw new HttpError(410, "WORKER_RETENTION_EXPIRED", "This worker passed the 30-day reactivation window and was permanently retired. Add them again with the same email.");
  }
  if (request.action === "update_permissions") {
    if (!request.capabilities) throw new HttpError(400, "INVALID_BODY", "Choose the worker capabilities");
    if (!isOwner && request.capabilities.some((capability) => capability === "MANAGE_BRANCHES" || capability === "MANAGE_BRANCH_WORKERS")) throw new HttpError(403, "FORBIDDEN", "Only the business owner can grant management capabilities");
    const grants = await db.rpc("set_worker_permissions", {
      p_business_id: context.businessId,
      p_user_id: target.id,
      p_permissions: request.capabilities,
    });
    if (grants.error) throw new HttpError(500, "UPDATE_FAILED", grants.error.message);
    await writeAudit(db, context.userId, context.businessId, "staff_permissions_updated", target.id, { capabilities: request.capabilities });
    return { status: "ok" };
  }
  if (request.action === "assign_branches") {
    const branchIds = request.branchIds ?? [];
    for (const branchId of branchIds) await validateBranch(db, context.businessId, branchId);
    if (!isOwner) for (const branchId of branchIds) requireAssignedBranch(context, branchId);
    await db.from("user_branches").delete().eq("user_id", target.id).eq("business_id", context.businessId);
    if (branchIds.length) {
      const assigned = await db.from("user_branches").insert(branchIds.map((branchId) => ({ user_id: target.id, branch_id: branchId, business_id: context.businessId })));
      if (assigned.error) throw new HttpError(500, "UPDATE_FAILED", assigned.error.message);
    }
    await writeAudit(db, context.userId, context.businessId, "staff_branches_updated", target.id, { branchIds });
    return { status: "ok" };
  }
  if (request.action === "designate_manager") {
    if (!request.branchId) throw new HttpError(400, "INVALID_BODY", "Choose a branch for the manager");
    await validateBranch(db, context.businessId, request.branchId);
    if (!isOwner) requireAssignedBranch(context, request.branchId);
    const assignment = await db.from("user_branches").upsert({ user_id: target.id, branch_id: request.branchId, business_id: context.businessId, is_manager: request.isManager === true }, { onConflict: "user_id,branch_id" });
    if (assignment.error) throw new HttpError(500, "UPDATE_FAILED", assignment.error.message);
    await writeAudit(db, context.userId, context.businessId, request.isManager ? "staff_manager_designated" : "staff_manager_removed", target.id, { branchId: request.branchId, isManager: request.isManager === true });
    return { status: "ok" };
  }
  const nextActive = request.action === "reactivate";
  const changedAt = new Date().toISOString();
  const profile = await db.from("users").update({ is_active: nextActive, deactivated_at: nextActive ? null : changedAt, updated_at: changedAt }).eq("id", target.id).eq("business_id", context.businessId);
  if (profile.error) throw new HttpError(500, "UPDATE_FAILED", profile.error.message);
  const membership = await db.from("business_memberships").update({ status: nextActive ? "active" : "disabled" }).eq("user_id", target.id).eq("business_id", context.businessId);
  if (membership.error) throw new HttpError(500, "UPDATE_FAILED", membership.error.message);
  await writeAudit(db, context.userId, context.businessId, nextActive ? "staff_reactivated" : "staff_deactivated", target.id, { status: nextActive ? "active" : "disabled" });
  return { status: "ok" };
}

export async function listStaff(context: AccountContext, readDb: SupabaseClient = supabaseAdmin()): Promise<{ staff: Awaited<ReturnType<typeof listBusinessStaff>> }> {
  if (!context.businessId || !canManageWorkers(context)) throw new HttpError(403, "FORBIDDEN", "This account cannot view staff");
  await purgeExpiredDeactivatedWorkers(supabaseAdmin(), context.businessId);
  return { staff: await listBusinessStaff(readDb, context.businessId) };
}

export async function getStaffMember(context: AccountContext, userId: string, readDb: SupabaseClient = supabaseAdmin()) {
  if (!context.businessId || !canManageWorkers(context)) throw new HttpError(403, "FORBIDDEN", "This account cannot view staff");
  await purgeExpiredDeactivatedWorkers(supabaseAdmin(), context.businessId);
  return getBusinessStaffMember(readDb, context.businessId, userId);
}

export async function getStaffAudit(context: AccountContext, readDb: SupabaseClient = supabaseAdmin()) {
  if (context.accountType !== "BUSINESS_OWNER" || !context.businessId) throw new HttpError(403, "FORBIDDEN", "Only a business owner can view staff audit");
  return { logs: await listStaffAudit(readDb, context.businessId) };
}
