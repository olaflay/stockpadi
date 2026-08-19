import { HttpError } from "../../shared/errors/http-error.js";
import type { AccountContext } from "../accounts/account-context.js";
import type { WorkerRequest } from "./worker.schema.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import { businessName, createWorkerRecords, getBusinessStaffMember, listBusinessStaff, listStaffAudit, removeWorkerRecords, validateBranch, validateCapacity, writeAudit } from "./worker.repository.js";
import { generatePassword } from "./worker.password.js";
import { sendInvite, sendPassword } from "./worker.email.js";

export async function executeWorkerOperation(context: AccountContext, request: WorkerRequest): Promise<Record<string, unknown>> {
  if (context.accountType !== "BUSINESS_OWNER" || !context.businessId) throw new HttpError(403, "FORBIDDEN", "Only a business owner can manage workers");
  const db = supabaseAdmin();
  const name = await businessName(db, context.businessId);
  if (request.action === "create") {
    await validateBranch(db, context.businessId, request.branchId);
    await validateCapacity(db, context.businessId);
    const password = generatePassword(name);
    const { data, error } = await db.auth.admin.createUser({ email: request.email!, password, email_confirm: true, user_metadata: { full_name: request.fullName, account_type: "WORKER" } });
    if (error || !data.user) throw new HttpError(409, "CREATE_FAILED", error?.message ?? "Could not create worker account");
    try {
      await createWorkerRecords(db, { userId: data.user.id, businessId: context.businessId, fullName: request.fullName!, branchId: request.branchId });
      await writeAudit(db, context.userId, context.businessId, "staff_created", data.user.id, { accountType: "WORKER", email: request.email });
      await sendInvite(request.email!, request.fullName!, password);
      return { status: "ok", userId: data.user.id, email: request.email };
    } catch (cause) {
      try { await removeWorkerRecords(db, data.user.id, context.businessId); } catch (cleanup) { console.error("Worker database compensation failed", cleanup); }
      await db.auth.admin.deleteUser(data.user.id);
      throw new HttpError(500, "PROVISIONING_FAILED", cause instanceof Error ? cause.message : "Worker provisioning failed");
    }
  }
  if (!request.userId) throw new HttpError(400, "INVALID_BODY", "userId is required");
  const { data: target, error: targetError } = await db.from("users").select("id, account_type, is_active").eq("id", request.userId).eq("business_id", context.businessId).maybeSingle();
  if (targetError || !target || target.account_type !== "WORKER") throw new HttpError(404, "NOT_FOUND", "Worker not found");
  if (request.action === "reset_password") {
    const { data: authTarget, error: authError } = await db.auth.admin.getUserById(target.id);
    if (authError || !authTarget.user?.email) throw new HttpError(409, "EMAIL_NOT_FOUND", "Worker email could not be found");
    const password = generatePassword(name);
    const updated = await db.auth.admin.updateUserById(target.id, { password });
    if (updated.error) throw new HttpError(500, "PASSWORD_UPDATE_FAILED", updated.error.message);
    try { await sendPassword(authTarget.user.email, password); } catch (error) { throw new HttpError(502, "MAIL_FAILED", `Password changed but delivery failed: ${error instanceof Error ? error.message : "email error"}`); }
    await writeAudit(db, context.userId, context.businessId, "password_reset", target.id, { delivery: "email" });
    return { status: "ok" };
  }
  const profile = await db.from("users").update({ is_active: false }).eq("id", target.id).eq("business_id", context.businessId);
  if (profile.error) throw new HttpError(500, "UPDATE_FAILED", profile.error.message);
  const membership = await db.from("business_memberships").update({ status: "disabled" }).eq("user_id", target.id).eq("business_id", context.businessId);
  if (membership.error) throw new HttpError(500, "UPDATE_FAILED", membership.error.message);
  await writeAudit(db, context.userId, context.businessId, "staff_deactivated", target.id, { status: "disabled" });
  return { status: "ok" };
}

export async function listStaff(context: AccountContext): Promise<{ staff: Awaited<ReturnType<typeof listBusinessStaff>> }> {
  if (context.accountType !== "BUSINESS_OWNER" || !context.businessId) throw new HttpError(403, "FORBIDDEN", "Only a business owner can view staff");
  return { staff: await listBusinessStaff(supabaseAdmin(), context.businessId) };
}

export async function getStaffMember(context: AccountContext, userId: string) {
  if (context.accountType !== "BUSINESS_OWNER" || !context.businessId) throw new HttpError(403, "FORBIDDEN", "Only a business owner can view staff");
  return getBusinessStaffMember(supabaseAdmin(), context.businessId, userId);
}

export async function getStaffAudit(context: AccountContext) {
  if (context.accountType !== "BUSINESS_OWNER" || !context.businessId) throw new HttpError(403, "FORBIDDEN", "Only a business owner can view staff audit");
  return { logs: await listStaffAudit(supabaseAdmin(), context.businessId) };
}
