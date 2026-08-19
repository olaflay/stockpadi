import type { SupabaseClient, User } from "@supabase/supabase-js";
import { HttpError } from "../../shared/errors/http-error.js";
import { resolveAccountContext } from "../accounts/account-context.js";
import { insertPlatformBroadcast } from "./broadcast.repository.js";

export async function publishPlatformBroadcast(db: SupabaseClient, actor: User, content: string) {
  const context = await resolveAccountContext(db, actor);
  if (context.accountType !== "ADMIN") throw new HttpError(403, "FORBIDDEN", "Platform admin access required");
  const normalized = content.trim();
  if (!normalized) throw new HttpError(400, "INVALID_BODY", "Broadcast content is required");
  return insertPlatformBroadcast(db, actor.id, normalized);
}
