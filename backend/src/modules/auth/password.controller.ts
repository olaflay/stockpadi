import { authenticateRequest } from "../../middleware/authenticate.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { meetsPasswordPolicy } from "../../shared/contracts.generated.js";

export async function handlePasswordUpdate(request: globalThis.Request, body: unknown) {
  const auth = await authenticateRequest(request);
  const db = supabaseAdmin();
  if (!body || typeof body !== "object" || typeof (body as Record<string, unknown>).password !== "string") throw new HttpError(400, "INVALID_BODY", "A password is required");
  const password = (body as Record<string, unknown>).password as string;
  if (!meetsPasswordPolicy(password)) throw new HttpError(400, "INVALID_BODY", "Password must use at least 8 characters, uppercase and lowercase letters, a number, and a symbol");
  const { error } = await db.auth.admin.updateUserById(auth.user.id, { password });
  if (error) throw new HttpError(500, "PASSWORD_UPDATE_FAILED", "Could not update password");
  return { ok: true };
}
