import { authenticateRequest } from "../../middleware/authenticate.js";
import { supabaseAdmin, supabaseForAccessToken } from "../../shared/supabase/client.js";
import { pullSession } from "./sync-pull.service.js";

export async function handleSyncPull(request: globalThis.Request) {
  const auth = await authenticateRequest(request);
  const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
  return pullSession(supabaseForAccessToken(auth.accessToken), auth.user, cursor, supabaseAdmin());
}
