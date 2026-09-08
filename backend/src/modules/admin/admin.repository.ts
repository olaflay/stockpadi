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
  const result = await db.from("business_profile").select("id, name, business_type, currency, status, is_active, branding, created_at, updated_at").eq("id", businessId).maybeSingle();
  if (result.error) throw new HttpError(500, "QUERY_FAILED", result.error.message);
  if (!result.data) return null;

  const owner = await db.from("users").select("id, full_name, is_active").eq("business_id", businessId).eq("account_type", "BUSINESS_OWNER").maybeSingle();
  const branches = await db.from("branches").select("id, name, address, is_active").eq("business_id", businessId);
  const productsCount = await db.from("products").select("id", { count: "exact", head: true }).eq("business_id", businessId);
  const workersCount = await db.from("users").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("account_type", "WORKER");

  return {
    ...result.data,
    owner_name: owner.data?.full_name ?? "Unknown Owner",
    owner_id: owner.data?.id ?? null,
    branches: branches.data ?? [],
    branch_count: branches.data?.length ?? 0,
    product_count: productsCount.count ?? 0,
    worker_count: workersCount.count ?? 0,
  };
}

export async function getSystemStats(db: SupabaseClient) {
  const businesses = await db.from("business_profile").select("id, status, is_active");
  if (businesses.error) throw new HttpError(500, "QUERY_FAILED", businesses.error.message);
  const allBusinesses = businesses.data ?? [];
  const total = allBusinesses.length;
  const verified = allBusinesses.filter((b) => b.status === "verified" || b.is_active).length;
  const suspended = allBusinesses.filter((b) => b.status === "suspended" || !b.is_active).length;
  const pending = allBusinesses.filter((b) => b.status === "pending").length;

  const totalUsers = await db.from("users").select("id", { count: "exact", head: true });
  const totalProducts = await db.from("products").select("id", { count: "exact", head: true });
  const totalBroadcasts = await db.from("broadcasts").select("id", { count: "exact", head: true }).eq("scope", "platform");

  return {
    total_tenants: total,
    verified_tenants: verified,
    suspended_tenants: suspended,
    pending_tenants: pending,
    total_users: totalUsers.count ?? 0,
    total_products: totalProducts.count ?? 0,
    total_broadcasts: totalBroadcasts.count ?? 0,
    status: "healthy",
    checked_at: new Date().toISOString(),
  };
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
