import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "../../shared/errors/http-error.js";

export async function listBusinesses(db: SupabaseClient) {
  const businesses = await db.from("business_profile").select("id, name, business_type, currency, is_active, status, created_at").order("created_at", { ascending: false });
  if (businesses.error) throw new HttpError(500, "QUERY_FAILED", businesses.error.message);
  const owners = await db.from("users").select("business_id, full_name").eq("account_type", "BUSINESS_OWNER");
  if (owners.error) throw new HttpError(500, "QUERY_FAILED", owners.error.message);
  return (businesses.data ?? []).map((business) => ({ ...business, owner_name: owners.data?.find((owner) => owner.business_id === business.id)?.full_name ?? "Unknown Owner" }));
}

export async function getBusiness(db: SupabaseClient, businessId: string) {
  const result = await db.from("business_profile").select("id, name, business_type, currency, status, is_active, created_at").eq("id", businessId).maybeSingle();
  if (result.error) throw new HttpError(500, "QUERY_FAILED", result.error.message);
  return result.data;
}

export async function setBusinessStatus(db: SupabaseClient, actorId: string, businessId: string, status: NonNullable<AdminRequestStatus>) {
  const result = await db.from("business_profile").update({ status, is_active: status === "verified" || status === "pending" }).eq("id", businessId);
  if (result.error) throw new HttpError(500, "UPDATE_FAILED", result.error.message);
  await writeAudit(db, actorId, businessId, `business_${status}`, { status });
}

async function writeAudit(db: SupabaseClient, actorId: string, businessId: string, action: string, state: unknown) {
  const result = await db.from("audit_logs").insert({ business_id: businessId, actor_user_id: actorId, action, entity_type: "business_profile", entity_id: businessId, before_state: null, after_state: state });
  if (result.error) throw new HttpError(500, "AUDIT_FAILED", result.error.message);
}

type AdminRequestStatus = "pending" | "verified" | "suspended" | "rejected";
