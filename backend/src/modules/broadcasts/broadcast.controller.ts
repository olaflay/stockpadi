import { authenticateRequest } from "../../middleware/authenticate.js";
import { supabaseForAccessToken } from "../../shared/supabase/client.js";
import { resolveAccountContext } from "../accounts/account-context.js";
import { HttpError } from "../../shared/errors/http-error.js";

export async function handleBroadcastList(request: Request) {
  const auth = await authenticateRequest(request);
  const db = supabaseForAccessToken(auth.accessToken);
  await resolveAccountContext(db, auth.user);
  const url = new URL(request.url);
  const before = url.searchParams.get("before");
  if (before && !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(before)) {
    throw new HttpError(400, "INVALID_CURSOR", "Invalid announcement cursor.");
  }
  // Request-scoped credentials preserve RLS: active platform announcements and
  // announcements for this user's business only. Drafts/expired rows stay hidden.
  let query = db.from("broadcasts")
    .select("id, content, created_at")
    .eq("status", "published")
    .lte("start_at", new Date().toISOString())
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(51);
  // The authenticated RLS policy enforces both start_at and end_at visibility.
  // Cursor has both fields so announcements with equal timestamps are not lost.
  const beforeId = url.searchParams.get("beforeId");
  if (before && beforeId) {
    if (!/^[0-9a-f-]{36}$/i.test(beforeId)) throw new HttpError(400, "INVALID_CURSOR", "Invalid announcement cursor.");
    query = query.or(`created_at.lt.${before},and(created_at.eq.${before},id.lt.${beforeId})`);
  } else if (before || beforeId) {
    throw new HttpError(400, "INVALID_CURSOR", "Invalid announcement cursor.");
  }
  const result = await query;
  if (result.error) throw new HttpError(500, "QUERY_FAILED", "Announcements could not be loaded.");
  const broadcasts = (result.data ?? []).slice(0, 50);
  const last = broadcasts.at(-1);
  return { broadcasts, nextCursor: result.data && result.data.length > 50 && last ? { before: last.created_at, beforeId: last.id } : null };
}
