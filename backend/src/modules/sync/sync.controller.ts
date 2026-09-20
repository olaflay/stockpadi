import { authenticateRequest } from "../../middleware/authenticate.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import { pushSyncBatch } from "./sync.service.js";

export async function handleSyncPush(request: globalThis.Request, body: unknown) {
  const auth = await authenticateRequest(request);
  return pushSyncBatch(supabaseAdmin(), auth.user, body);
}
