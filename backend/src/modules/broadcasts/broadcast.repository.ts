import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "../../shared/errors/http-error.js";

export async function insertPlatformBroadcast(db: SupabaseClient, actorId: string, content: string) {
  const result = await db.from("broadcasts").insert({
    scope: "platform",
    content,
    priority: 0,
    status: "published",
    created_by: actorId,
  }).select("id").single();
  if (result.error) throw new HttpError(500, "INSERT_FAILED", result.error.message);
  return result.data.id;
}

export async function listPlatformBroadcasts(db: SupabaseClient) {
  const result = await db
    .from("broadcasts")
    .select("id, scope, content, priority, status, created_at, created_by")
    .eq("scope", "platform")
    .order("created_at", { ascending: false });
  if (result.error) throw new HttpError(500, "QUERY_FAILED", result.error.message);
  return result.data ?? [];
}
