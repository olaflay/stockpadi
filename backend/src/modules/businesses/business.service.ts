import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { validateRegistration, type RegistrationRequest } from "./business.schema.js";

export async function registerBusiness(request: RegistrationRequest, authenticatedUser?: User) {
  const db = supabaseAdmin();
  if (request.action === "complete_oauth") {
    if (!authenticatedUser) throw new HttpError(401, "UNAUTHENTICATED", "OAuth session is required");
    if (!request.businessName || !request.businessTypeId) throw new HttpError(400, "INVALID_BODY", "Business details are required");
    const existing = await db.from("users").select("id").eq("id", authenticatedUser.id).maybeSingle();
    if (existing.error) throw new HttpError(500, "PROFILE_LOOKUP_FAILED", existing.error.message);
    if (existing.data) return { userId: authenticatedUser.id };
    const result = await provision(db, authenticatedUser.id, authenticatedUser.user_metadata?.full_name ?? authenticatedUser.email?.split("@")[0] ?? "Owner", request.businessName, request.businessTypeId);
    if (result.error) throw new HttpError(500, "PROVISIONING_FAILED", result.error.message);
    return { userId: authenticatedUser.id, businessId: await findBusinessId(db, authenticatedUser.id) };
  }
  validateRegistration(request);
  const created = await db.auth.admin.createUser({ email: request.email!, password: request.password!, email_confirm: true, user_metadata: { full_name: request.fullName, business_name: request.businessName, business_type_id: request.businessTypeId, account_type: "BUSINESS_OWNER" } });
  if (created.error) throw registrationCreationError(created.error);
  if (!created.data.user) throw new HttpError(502, "AUTH_CREATE_FAILED", "The authentication service did not create the account");
  const result = await provision(db, created.data.user.id, request.fullName!, request.businessName!, request.businessTypeId!);
  if (result.error) {
    const cleanup = await db.auth.admin.deleteUser(created.data.user.id);
    if (cleanup.error) console.error("Registration Auth compensation failed", cleanup.error);
    throw new HttpError(500, "PROVISIONING_FAILED", result.error.message);
  }
  return { userId: created.data.user.id, businessId: await findBusinessId(db, created.data.user.id) };
}

export function registrationCreationError(error: { code?: string; message: string }) {
  if (error.code === "email_exists" || error.code === "user_already_exists") {
    return new HttpError(409, "EMAIL_ALREADY_REGISTERED", "An account with this email already exists. Sign in instead.");
  }
  if (error.code === "weak_password" || error.code === "validation_failed") {
    return new HttpError(400, "AUTH_VALIDATION_FAILED", "Check the email and use a stronger password, then try again.");
  }
  if (error.code === "email_provider_disabled") {
    return new HttpError(503, "EMAIL_SIGNUP_DISABLED", "Email signup is disabled in the authentication service.");
  }
  if (error.code === "unexpected_failure") {
    return new HttpError(502, "AUTH_DATABASE_ERROR", "The authentication database rejected account creation. Ask the project owner to apply pending migrations and inspect Supabase Auth logs.");
  }
  return new HttpError(502, "AUTH_CREATE_FAILED", "The authentication service could not create the account");
}

async function findBusinessId(db: ReturnType<typeof supabaseAdmin>, userId: string): Promise<string | undefined> {
  const result = await db.from("business_memberships").select("business_id").eq("user_id", userId).limit(1).maybeSingle();
  if (result.error) throw new HttpError(500, "PROVISIONING_LOOKUP_FAILED", result.error.message);
  return result.data?.business_id;
}

function provision(db: ReturnType<typeof supabaseAdmin>, userId: string, fullName: string, businessName: string, businessTypeId: string) {
  return db.rpc("provision_business_owner", { p_user_id: userId, p_full_name: fullName, p_business_name: businessName, p_business_type: businessTypeId });
}
