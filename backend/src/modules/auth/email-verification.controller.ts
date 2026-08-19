import { authenticateRequest } from "../../middleware/authenticate.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import { sendVerificationCode, verifyEmailCode } from "./email-verification.service.js";

export async function handleSendVerification(request: Request) {
  const { user } = await authenticateRequest(request);
  return sendVerificationCode(supabaseAdmin(), user);
}

export async function handleVerifyEmail(request: Request, body: unknown) {
  const { user } = await authenticateRequest(request);
  const code = body && typeof body === "object" && typeof (body as { code?: unknown }).code === "string" ? (body as { code: string }).code.trim() : "";
  return verifyEmailCode(supabaseAdmin(), user, code);
}
