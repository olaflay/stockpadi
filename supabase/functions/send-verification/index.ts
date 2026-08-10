// Edge Function: send-verification
// Generates a 6-digit verification code, stores a SHA-256 hash of it in the
// users table with a 30-minute expiry, and sends the code to the owner's
// email address via Nodemailer SMTP.
//
// Called:
//   1. Immediately after account creation (from register/page.tsx) — first
//      time the owner registers.
//   2. When the owner clicks "Resend code" in EmailVerificationBanner.
//
// Security rules per .agents/skills/write-edge-function.md:
//   - Caller identity is re-verified server-side via their JWT, not trusted
//     from the client payload.
//   - Only the owner of the account may request a code for their own address.
//   - Codes are hashed before storage — the raw 6-digit value never hits the DB.
//   - Rate limit: one send per 60 seconds enforced by checking
//     email_verification_expires_at (a new code's expiry is 30 min from now;
//     if an unexpired code was sent less than 60s ago, reject with 429).

import { createClient } from "npm:@supabase/supabase-js@2";
import { sendMail } from "../_shared/mailer.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function err(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

/** SHA-256 hex digest of a string. Runs on Deno's built-in Web Crypto API. */
async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generates a 6-digit numeric code from 32 cryptographically random bytes.
 * Using 32 bytes and modulo gives strong uniformity for a 6-digit space.
 */
function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  // Take first 8 hex chars (32 bits) → unsigned integer → mod 1,000,000
  const n = parseInt(hex.slice(0, 8), 16) % 1_000_000;
  return n.toString().padStart(6, "0");
}

function verificationEmailHtml(fullName: string, code: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your StockPadi verification code</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f4;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f4;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(20,24,26,0.10);">
          <tr>
            <td style="background:#0a6e4d;padding:24px 32px;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">StockPadi</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 8px;font-size:16px;color:#14181a;">Hi ${fullName},</p>
              <p style="margin:0 0 24px;font-size:15px;color:#565f61;line-height:1.5;">
                Your verification code for StockPadi is:
              </p>
              <div style="background:#f4f5f4;border-radius:10px;padding:20px;text-align:center;margin-bottom:24px;">
                <span style="font-size:36px;font-weight:700;color:#0a6e4d;letter-spacing:0.25em;">${code}</span>
              </div>
              <p style="margin:0 0 8px;font-size:15px;color:#565f61;line-height:1.5;">
                Enter this code in the app to confirm your email address. It expires in 30 minutes.
              </p>
              <p style="margin:0;font-size:13px;color:#a4adaf;">
                If you did not create a StockPadi account, ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #e9ebe9;">
              <p style="margin:0;font-size:13px;color:#a4adaf;">— StockPadi</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return err(405, "METHOD_NOT_ALLOWED", "POST only");

  // Verify the calling user's JWT
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return err(401, "UNAUTHENTICATED", "Missing bearer token");

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { user: authUser }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authUser) return err(401, "UNAUTHENTICATED", "Invalid or expired session");

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Load the user's profile — only owner role may request email verification
  const { data: profile } = await db
    .from("users")
    .select("id, full_name, role, email_verified, email_verification_expires_at")
    .eq("id", authUser.id)
    .maybeSingle();

  if (!profile) return err(403, "FORBIDDEN", "No staff account found for this session");
  if (profile.role !== "owner") return err(403, "FORBIDDEN", "Only the store owner verifies their email");
  if (profile.email_verified) return err(409, "ALREADY_VERIFIED", "Email is already verified");

  // Rate limit: reject if a code was issued within the last 60 seconds.
  // A 30-min expiry means the stored expiry is (now + 30 min). If
  // (expiry - 29 min) > now, the code was issued less than 1 minute ago.
  if (profile.email_verification_expires_at) {
    const issuedAt = new Date(profile.email_verification_expires_at).getTime() - 30 * 60 * 1000;
    const secondsAgo = (Date.now() - issuedAt) / 1000;
    if (secondsAgo < 60) {
      return err(429, "RATE_LIMITED", `Wait ${Math.ceil(60 - secondsAgo)} seconds before requesting a new code`);
    }
  }

  // Generate code + hash
  const code = generateCode();
  const codeHash = await sha256(code);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  // Store hash + expiry (not the raw code)
  const { error: updateError } = await db
    .from("users")
    .update({
      email_verification_code_hash: codeHash,
      email_verification_expires_at: expiresAt,
      // A fresh code resets the wrong-guess counter enforced in verify-email —
      // see supabase/migrations/20260809122000_email_verification_attempt_limit.sql.
      email_verification_attempts: 0,
    })
    .eq("id", authUser.id);

  if (updateError) return err(500, "UPDATE_FAILED", "Could not store verification code");

  // Send email
  try {
    await sendMail({
      to: authUser.email!,
      subject: "Your StockPadi verification code",
      text: `Hi ${profile.full_name},\n\nYour verification code for StockPadi is:\n\n${code}\n\nEnter this code in the app to confirm your email address. It expires in 30 minutes.\n\nIf you did not create a StockPadi account, ignore this email.\n\n— StockPadi`,
      html: verificationEmailHtml(profile.full_name, code),
    });
  } catch (mailErr) {
    // Log the SMTP error server-side but don't expose the reason to the client.
    console.error("SMTP error in send-verification:", mailErr);
    return err(502, "MAIL_FAILED", "Could not send the verification email. Check SMTP configuration.");
  }

  return ok({ status: "sent" });
});
