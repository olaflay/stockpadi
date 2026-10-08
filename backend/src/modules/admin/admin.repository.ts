import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "../../shared/errors/http-error.js";
import { queueSyncHints } from "../sync/sync-hints.js";

export async function listBusinesses(db: SupabaseClient, actorId?: string) {
  const businesses = await db.from("business_profile").select("id, name, business_type, currency, is_active, status, created_at").order("created_at", { ascending: false });
  if (businesses.error) throw new HttpError(500, "QUERY_FAILED", businesses.error.message);
  const owners = await db.from("users").select("business_id, full_name").eq("account_type", "BUSINESS_OWNER");
  if (owners.error) throw new HttpError(500, "QUERY_FAILED", owners.error.message);
  const result = (businesses.data ?? []).map((business) => ({ ...business, owner_name: owners.data?.find((owner) => owner.business_id === business.id)?.full_name ?? "Unknown Owner" }));
  if (actorId) {
    await writePlatformAudit(db, actorId, "list_businesses", "business_profile", null, null, { count: result.length });
  }
  return result;
}

export async function getBusiness(db: SupabaseClient, actorId: string, businessId: string) {
  const result = await db.from("business_profile").select("id, name, business_type, currency, status, is_active, branding, created_at, updated_at").eq("id", businessId).maybeSingle();
  if (result.error) throw new HttpError(500, "QUERY_FAILED", result.error.message);
  if (!result.data) return null;

  const owner = await db.from("users").select("id, full_name, is_active").eq("business_id", businessId).eq("account_type", "BUSINESS_OWNER").maybeSingle();
  const branches = await db.from("branches").select("id, name, address, is_active").eq("business_id", businessId);
  const productsCount = await db.from("products").select("id", { count: "exact", head: true }).eq("business_id", businessId);
  const workersCount = await db.from("users").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("account_type", "WORKER");

  await writePlatformAudit(db, actorId, "get_business", "business_profile", businessId, businessId);

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

export async function getSystemStats(db: SupabaseClient, actorId?: string) {
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

  if (actorId) {
    await writePlatformAudit(db, actorId, "get_system_stats", "platform", null, null);
  }

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
  const rpcResult = await db.rpc("platform_set_business_status", {
    p_business_id: businessId,
    p_status: status,
    p_actor_id: actorId,
    p_metadata: { status },
  });
  if (rpcResult.error) {
    if (rpcResult.error.message?.includes("BUSINESS_NOT_FOUND")) {
      throw new HttpError(404, "NOT_FOUND", "Business not found");
    }
    throw new HttpError(500, "UPDATE_FAILED", rpcResult.error.message);
  }
  queueSyncHints(businessId, [null]);
}

export async function writePlatformAudit(
  db: SupabaseClient,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string | null = null,
  businessId: string | null = null,
  metadata: Record<string, unknown> = {}
) {
  const table = db.from("platform_audit_logs");
  if (typeof table?.insert !== "function") return;
  const result = await table.insert({
    actor_user_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    business_id: businessId,
    metadata,
  });
  if (result?.error) throw new HttpError(500, "AUDIT_FAILED", result.error.message);
}

type AdminRequestStatus = "pending" | "verified" | "suspended" | "rejected";
