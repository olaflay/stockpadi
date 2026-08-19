import type { SupabaseClient, User } from "@supabase/supabase-js";
import { HttpError } from "../../shared/errors/http-error.js";
import { sendEmail } from "../../shared/email/mailer.js";

const CODE_TTL_MS = 30 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function generateCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return (new DataView(bytes.buffer).getUint32(0) % 1_000_000).toString().padStart(6, "0");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function verificationEmail(fullName: string, code: string) {
  const safeName = escapeHtml(fullName);
  return {
    subject: "Your StockPadi verification code",
    text: `Hi ${fullName},\n\nYour StockPadi verification code is ${code}. It expires in 30 minutes. Do not share this code.\n\nIf you did not create this account, ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto"><h1 style="color:#0a6e4d">StockPadi</h1><p>Hi ${safeName},</p><p>Your verification code is:</p><p style="font-size:36px;font-weight:bold;letter-spacing:8px;text-align:center">${code}</p><p>This code expires in 30 minutes. Never share it with anyone.</p><p>If you did not create this account, ignore this email.</p></div>`,
  };
}

function welcomeEmail(fullName: string, storeName: string) {
  return {
    subject: "Your StockPadi store is ready",
    text: `Hi ${fullName},\n\nYour email is verified and ${storeName} is ready to use. Invite Workers, add products, and record your first sale.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto"><h1 style="color:#0a6e4d">StockPadi</h1><p>Hi ${escapeHtml(fullName)},</p><p>Your email is verified and <strong>${escapeHtml(storeName)}</strong> is ready to use.</p></div>`,
  };
}

export async function sendVerificationCode(db: SupabaseClient, actor: User) {
  const { data: profile, error } = await db.from("users").select("id, full_name, account_type, email_verified, email_verification_expires_at").eq("id", actor.id).maybeSingle();
  if (error) throw new HttpError(500, "PROFILE_QUERY_FAILED", error.message);
  if (!profile || profile.account_type !== "BUSINESS_OWNER") throw new HttpError(403, "FORBIDDEN", "Only a business owner may verify email");
  if (profile.email_verified) throw new HttpError(409, "ALREADY_VERIFIED", "Email is already verified");
  if (profile.email_verification_expires_at && Date.now() - (new Date(profile.email_verification_expires_at).getTime() - CODE_TTL_MS) < RESEND_COOLDOWN_MS) throw new HttpError(429, "RATE_LIMITED", "Wait before requesting another code");

  const code = generateCode();
  const { error: updateError } = await db.from("users").update({ email_verification_code_hash: await sha256(code), email_verification_expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(), email_verification_attempts: 0 }).eq("id", actor.id);
  if (updateError) throw new HttpError(500, "UPDATE_FAILED", "Could not store verification code");

  if (process.env.NODE_ENV !== "production" && process.env.DEV_LOG_VERIFICATION_CODES === "true") {
    console.warn("[DEV ONLY] Verification-code logging is enabled. Disable DEV_LOG_VERIFICATION_CODES outside local development.");
    console.log(`[DEV ONLY] Verification code for user ${actor.id}: ${code}`);
  }
  try {
    await sendEmail({ to: actor.email ?? "", ...verificationEmail(profile.full_name, code) });
  } catch (error) {
    console.error("Verification email delivery failed", error instanceof Error ? error.message : "unknown error");
    throw new HttpError(502, "MAIL_FAILED", "Could not send the verification email");
  }
  return { status: "sent" };
}

export async function verifyEmailCode(db: SupabaseClient, actor: User, submittedCode: string) {
  if (!/^\d{6}$/.test(submittedCode)) throw new HttpError(400, "INVALID_CODE", "Enter a 6-digit numeric code");
  const { data: profile, error } = await db.from("users").select("id, full_name, account_type, email_verified, email_verification_code_hash, email_verification_expires_at, email_verification_attempts, business_id").eq("id", actor.id).maybeSingle();
  if (error) throw new HttpError(500, "PROFILE_QUERY_FAILED", error.message);
  if (!profile || profile.account_type !== "BUSINESS_OWNER") throw new HttpError(403, "FORBIDDEN", "Only a business owner may verify email");
  if (profile.email_verified) throw new HttpError(409, "ALREADY_VERIFIED", "Email is already verified");
  if (!profile.email_verification_code_hash || !profile.email_verification_expires_at) throw new HttpError(400, "NO_CODE", "No verification code is available");
  if (new Date(profile.email_verification_expires_at).getTime() < Date.now()) throw new HttpError(400, "CODE_EXPIRED", "This code has expired");
  if ((profile.email_verification_attempts ?? 0) >= MAX_ATTEMPTS) {
    await db.from("users").update({ email_verification_code_hash: null, email_verification_expires_at: null }).eq("id", actor.id);
    throw new HttpError(429, "TOO_MANY_ATTEMPTS", "Too many wrong attempts. Request a new code.");
  }
  if (await sha256(submittedCode) !== profile.email_verification_code_hash) {
    const nextAttempts = (profile.email_verification_attempts ?? 0) + 1;
    await db.from("users").update({ email_verification_attempts: nextAttempts, ...(nextAttempts >= MAX_ATTEMPTS ? { email_verification_code_hash: null, email_verification_expires_at: null } : {}) }).eq("id", actor.id);
    throw new HttpError(400, "WRONG_CODE", "That code is not correct");
  }
  const { error: updateError } = await db.from("users").update({ email_verified: true, email_verification_code_hash: null, email_verification_expires_at: null, email_verification_attempts: 0 }).eq("id", actor.id);
  if (updateError) throw new HttpError(500, "UPDATE_FAILED", "Could not confirm verification");
  const { data: business } = await db.from("business_profile").select("name").eq("id", profile.business_id).maybeSingle();
  try { await sendEmail({ to: actor.email ?? "", ...welcomeEmail(profile.full_name, business?.name ?? "your store") }); } catch (error) { console.error("Welcome email delivery failed", error instanceof Error ? error.message : "unknown error"); }
  return { status: "verified" };
}
