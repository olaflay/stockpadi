import type { SupabaseClient, User } from "@supabase/supabase-js";
import { HttpError } from "../../shared/errors/http-error.js";
import { resolveAccountContext } from "../accounts/account-context.js";
import { requireBusinessOwner } from "../authorization/capabilities.js";

export async function getBusinessProfile(db: SupabaseClient, actor: User) {
  const context = await resolveAccountContext(db, actor);
  if (!context.businessId) throw new HttpError(403, "FORBIDDEN", "A business account is required");
  const { data, error } = await db.from("business_profile").select("id, name, business_type, currency, branding, status, owing_message_template, updated_at").eq("id", context.businessId).maybeSingle();
  if (error) throw new HttpError(500, "PROFILE_LOAD_FAILED", "Could not load the business profile.");
  if (!data) throw new HttpError(404, "PROFILE_NOT_FOUND", "Business profile was not found.");
  return data;
}

export async function updateBusinessProfile(db: SupabaseClient, actor: User, input: unknown) {
  const context = await resolveAccountContext(db, actor);
  if (!context.businessId) throw new HttpError(403, "FORBIDDEN", "A business account is required");
  requireBusinessOwner(context);
  const body = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const businessType = typeof body.businessTypeId === "string" ? body.businessTypeId.trim() : "";
  if (name.length < 2 || name.length > 160 || !businessType) throw new HttpError(400, "INVALID_BODY", "A valid business name and type are required.");
  const update: Record<string, unknown> = { name, business_type: businessType, updated_at: new Date().toISOString() };
  if (body.owingMessageTemplate !== undefined) {
    const template = typeof body.owingMessageTemplate === "string" ? body.owingMessageTemplate.trim() : "";
    if (template.length < 1 || template.length > 1000 || /{{\s*(?!customerName\b|businessName\b|amountOwed\b)[^}]+}}/.test(template)) throw new HttpError(400, "INVALID_OWING_TEMPLATE", "Use only customerName, businessName, and amountOwed variables.");
    update.owing_message_template = template;
  }
  const { data, error } = await db.from("business_profile").update(update).eq("id", context.businessId).select("id, name, business_type, currency, branding, status, owing_message_template, updated_at").single();
  if (error) throw new HttpError(500, "PROFILE_UPDATE_FAILED", "Could not update the business profile.");
  return data;
}
