import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { meetsPasswordPolicy } from "../../shared/contracts.generated.js";
import { passwordRecoveryUrl, renderPasswordRecoveryEmail } from "../../shared/email/email-templates.js";
import { sendEmail, validateEmailConfig } from "../../shared/email/mailer.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { logger } from "../../shared/logging/logger.js";
import { supabaseAdmin, supabaseForRecovery } from "../../shared/supabase/client.js";

const RECOVERY_REQUEST_MIN_MS = 900;
const TOKEN_HASH_PATTERN = /^[a-z0-9_-]{32,128}$/i;

export async function handlePasswordRecoveryRequest(body: unknown) {
  const started = Date.now();
  const { email: input } = (body ?? {}) as { email?: unknown };
  const email = typeof input === "string" ? input.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "INVALID_EMAIL", "Enter a valid email address.");
  }

  if (!validateEmailConfig().configured) {
    logger.error("Password recovery mail is unconfigured");
    throw new HttpError(503, "RECOVERY_UNAVAILABLE", "Password recovery is temporarily unavailable.");
  }
  const url = passwordRecoveryUrl();
  const db = supabaseAdmin();
  const emailHash = createHash("sha256").update(email).digest("hex");
  const claim = await db.rpc("claim_password_recovery_request", { p_email_hash: emailHash });
  if (claim.error) {
    logger.error("Password recovery cooldown unavailable", { code: claim.error.code });
    throw new HttpError(503, "RECOVERY_UNAVAILABLE", "Password recovery is temporarily unavailable.");
  }
  try {
    if (claim.data === true) {
      const { data, error } = await db.auth.admin.generateLink({ type: "recovery", email });
      const token = data.properties?.hashed_token;
      if (error) {
        if (error.code !== "user_not_found") logger.warn("Password recovery token generation failed", { code: error.code });
      } else if (token) {
        url.hash = new URLSearchParams({ token_hash: token }).toString();
        await sendEmail({ to: email, ...renderPasswordRecoveryEmail(url) });
      }
    }
  } catch {
    logger.warn("Password recovery email delivery failed");
  }
  await delay(Math.max(0, RECOVERY_REQUEST_MIN_MS - (Date.now() - started)));
  return { ok: true };
}

export async function handlePasswordRecoveryComplete(body: unknown) {
  const { tokenHash, password } = (body ?? {}) as { tokenHash?: unknown; password?: unknown };
  if (typeof tokenHash !== "string" || !TOKEN_HASH_PATTERN.test(tokenHash)) {
    throw new HttpError(400, "RESET_LINK_INVALID", "This reset link is invalid or expired. Request a new one.");
  }
  if (typeof password !== "string" || !meetsPasswordPolicy(password)) {
    throw new HttpError(400, "INVALID_PASSWORD", "Use at least 8 characters, upper and lowercase letters, a number, and a symbol.");
  }

  const recovery = supabaseForRecovery();
  const { data, error } = await recovery.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
  if (error?.status === 429) throw new HttpError(429, "RATE_LIMITED", "Too many attempts. Wait a minute and try again.");
  if (error && (!error.status || error.status >= 500)) {
    throw new HttpError(503, "RECOVERY_UNAVAILABLE", "Password recovery is temporarily unavailable.");
  }
  if (error || !data.session || !data.user) {
    throw new HttpError(400, "RESET_LINK_INVALID", "This reset link is invalid or expired. Request a new one.");
  }

  const db = supabaseAdmin();
  const result = await db.auth.admin.updateUserById(data.user.id, { password });
  if (result.error) {
    await db.auth.admin.signOut(data.session.access_token, "local");
    logger.warn("Password update after recovery failed", { code: result.error.code });
    throw new HttpError(409, "RESET_LINK_USED", "We couldn't update your password. Request a fresh link and try again.");
  }
  const revocation = await db.auth.admin.signOut(data.session.access_token, "global");
  if (revocation.error) logger.warn("Password recovery session revocation failed", { code: revocation.error.code });
  return { ok: true };
}
