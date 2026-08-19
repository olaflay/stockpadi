import { authenticateRequest } from "../../middleware/authenticate.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import { executeAdminOperation } from "./admin.service.js";
import { parseAdminRequest } from "./admin.schema.js";

export async function handleAdminRequest(request: globalThis.Request, body: unknown) {
  const auth = await authenticateRequest(request);
  return executeAdminOperation(supabaseAdmin(), auth.user, parseAdminRequest(body));
}
