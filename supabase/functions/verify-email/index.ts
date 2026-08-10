// Edge Function: verify-email
// Accepts a 6-digit code submitted by the owner, hashes it, and compares
// it against the stored hash. On match (and within expiry), sets
// email_verified = true, clears the code columns, and sends the welcome email.
//
// The welcome email is sent ONLY after this server-side verification step
// confirms the account creation succeeded — per the product requirement.
//
// Security rules per .agents/skills/write-edge-function.md:
//   - Caller identity re-verified via JWT.
//   - Code compared as SHA-256 hashes — no raw string stored in DB at any point.
//   - Constant-time-equivalent comparison: both the submitted and stored hash
//     are the same length (64 hex chars), so a simple string equality is
//     safe against timing attacks at this size.
//   - Expiry enforced server-side, not client-side.
//   - A wrong guess increments email_verification_attempts; after
//     MAX_VERIFICATION_ATTEMPTS the code is invalidated (cleared) and the
//     owner must request a new one. Without this, a 6-digit code
//     (1,000,000 combinations) is guessable well within its 30-minute
//     window — the send-verification 60s issue-cooldown only throttles
//     issuing new codes, not guesses against the current one.

import { createClient } from "npm:@supabase/supabase-js@2";
import { sendMail } from "../_shared/mailer.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MAX_VERIFICATION_ATTEMPTS = 5;

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

function errResp(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function welcomeEmailHtml(fullName: string, storeName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your store is live on StockPadi</title>
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
              <p style="margin:0 0 16px;font-size:22px;font-weight:700;color:#14181a;letter-spacing:-0.5px;">
                Your store is live
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#565f61;line-height:1.5;">
                Hi ${fullName}, your account is confirmed and your store, <strong>${storeName}</strong>, is ready to go.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;width:100%;">
                <tr>
                  <td style="padding:12px 16px;background:#f4f5f4;border-radius:10px;margin-bottom:8px;">
                    <p style="margin:0;font-size:15px;color:#14181a;">
                      <strong>Products</strong> &mdash; Add what you sell
                    </p>
                  </td>
                </tr>
                <tr><td style="height:8px;"></td></tr>
                <tr>
                  <td style="padding:12px 16px;background:#f4f5f4;border-radius:10px;margin-bottom:8px;">
                    <p style="margin:0;font-size:15px;color:#14181a;">
                      <strong>Settings</strong> &mdash; Set PINs for your staff
                    </p>
                  </td>
                </tr>
                <tr><td style="height:8px;"></td></tr>
                <tr>
                  <td style="padding:12px 16px;background:#f4f5f4;border-radius:10px;">
                    <p style="margin:0;font-size:15px;color:#14181a;">
                      <strong>Sell</strong> &mdash; Record your first sale
                    </p>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:13px;color:#a4adaf;line-height:1.5;">
                If you ever need to reset your password or add a branch, go to Settings.
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
  if (req.method !== "POST") return errResp(405, "METHOD_NOT_ALLOWED", "POST only");

  // Verify caller JWT
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return errResp(401, "UNAUTHENTICATED", "Missing bearer token");

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { user: authUser }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authUser) return errResp(401, "UNAUTHENTICATED", "Invalid or expired session");

  // Parse body
  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return errResp(400, "INVALID_BODY", "Request body must be valid JSON");
  }

  const submittedCode = (body.code ?? "").trim();
  if (!/^\d{6}$/.test(submittedCode)) {
    return errResp(400, "INVALID_CODE", "Enter a 6-digit numeric code");
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Load profile
  const { data: profile } = await db
    .from("users")
    .select(
      "id, full_name, role, email_verified, email_verification_code_hash, email_verification_expires_at, email_verification_attempts"
    )
    .eq("id", authUser.id)
    .maybeSingle();

  if (!profile) return errResp(403, "FORBIDDEN", "No staff account found");
  if (profile.role !== "owner") return errResp(403, "FORBIDDEN", "Only the store owner verifies their email");
  if (profile.email_verified) return errResp(409, "ALREADY_VERIFIED", "Email is already verified");

  if (!profile.email_verification_code_hash || !profile.email_verification_expires_at) {
    return errResp(400, "NO_CODE", "No verification code on file. Request a new one.");
  }

  // Check expiry
  if (new Date(profile.email_verification_expires_at).getTime() < Date.now()) {
    return errResp(400, "CODE_EXPIRED", "This code has expired. Request a new one.");
  }

  if ((profile.email_verification_attempts ?? 0) >= MAX_VERIFICATION_ATTEMPTS) {
    // Invalidate the code outright rather than just keep counting — a fresh
    // code (and fresh attempt budget) is only issued via send-verification.
    await db
      .from("users")
      .update({ email_verification_code_hash: null, email_verification_expires_at: null })
      .eq("id", authUser.id);
    return errResp(429, "TOO_MANY_ATTEMPTS", "Too many wrong attempts. Request a new code.");
  }

  // Compare hashes
  const submittedHash = await sha256(submittedCode);
  if (submittedHash !== profile.email_verification_code_hash) {
    await db
      .from("users")
      .update({ email_verification_attempts: (profile.email_verification_attempts ?? 0) + 1 })
      .eq("id", authUser.id);
    return errResp(400, "WRONG_CODE", "That code is not correct. Check the email and try again.");
  }

  // Mark verified, clear code columns
  const { error: updateError } = await db
    .from("users")
    .update({
      email_verified: true,
      email_verification_code_hash: null,
      email_verification_expires_at: null,
      email_verification_attempts: 0,
    })
    .eq("id", authUser.id);

  if (updateError) return errResp(500, "UPDATE_FAILED", "Could not confirm verification");

  // Load store name for the welcome email
  const { data: biz } = await db
    .from("business_profile")
    .select("name")
    .single();

  const storeName = biz?.name ?? "your store";

  // Send welcome email — after confirmed server-side success
  try {
    await sendMail({
      to: authUser.email!,
      subject: "Your store is live on StockPadi",
      text: `Hi ${profile.full_name},\n\nYour account is confirmed and your store, ${storeName}, is ready to go.\n\nA few things you can do right now:\n- Add your products under Products\n- Set PINs for your staff in Settings\n- Record your first sale from the Sell tab\n\nIf you ever need to reset your password or add a branch, go to Settings.\n\n— StockPadi`,
      html: welcomeEmailHtml(profile.full_name, storeName),
    });
  } catch (mailErr) {
    // Verification is already confirmed in the DB — don't roll it back because
    // the welcome email failed. Log server-side and continue.
    console.error("SMTP error sending welcome email:", mailErr);
  }

  return ok({ status: "verified" });
});
