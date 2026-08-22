import { authenticateRequest } from "../../middleware/authenticate.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { resolveAccountContext } from "../accounts/account-context.js";

export async function handlePasswordUpdate(request: globalThis.Request, body: unknown) {
  const auth = await authenticateRequest(request);
  const db = supabaseAdmin();
  const context = await resolveAccountContext(db, auth.user);
  if (context.accountType === "WORKER") throw new HttpError(403, "FORBIDDEN", "Workers cannot change their own password");
  if (!body || typeof body !== "object" || typeof (body as Record<string, unknown>).password !== "string") throw new HttpError(400, "INVALID_BODY", "A password is required");
  const password = (body as Record<string, unknown>).password as string;
  if (password.length < 8) throw new HttpError(400, "INVALID_BODY", "Password must be at least 8 characters");
  const { error } = await db.auth.admin.updateUserById(auth.user.id, { password });
  if (error) throw new HttpError(500, "PASSWORD_UPDATE_FAILED", "Could not update password");
  return { ok: true };
}
