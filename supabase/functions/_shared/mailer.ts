/**
 * Shared Nodemailer SMTP transport factory for StockPadi Edge Functions.
 * Both send-verification and verify-email import createTransport() from here.
 *
 * Credentials come from Deno environment variables (set in Supabase Edge
 * Function secrets, never committed to git):
 *   SMTP_HOST    e.g. smtp.resend.com | smtp.brevo.com | smtp.gmail.com
 *   SMTP_PORT    e.g. 587 (STARTTLS) or 465 (TLS)
 *   SMTP_SECURE  "true" for port 465, leave empty/false for 587 STARTTLS
 *   SMTP_USER    your SMTP login (often your email or "apikey" for Resend)
 *   SMTP_PASS    your SMTP password or API key
 *   SMTP_FROM    "StockPadi <noreply@yourdomain.com>"
 *
 * Works with any standard SMTP provider. Recommended:
 *   Resend       — host: smtp.resend.com, port: 465, user: "resend", secure: true
 *   Brevo        — host: smtp-relay.brevo.com, port: 587, secure: false
 *   Gmail        — host: smtp.gmail.com, port: 465, user: your email, secure: true
 *
 * See .agents/rules/hosting-and-deployment.md for the self-hosted infra
 * context — SMTP secrets live in Coolify's environment variable store.
 */

// Nodemailer runs inside Deno via the npm: specifier.
// @ts-expect-error: Deno npm import, types resolved at runtime.
import nodemailer from "npm:nodemailer@6";

export interface MailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Returns a ready-to-use Nodemailer transporter configured from env vars. */
export function createTransport() {
  const host = Deno.env.get("SMTP_HOST");
  const port = parseInt(Deno.env.get("SMTP_PORT") ?? "587", 10);
  const secure = Deno.env.get("SMTP_SECURE") === "true";
  const user = Deno.env.get("SMTP_USER");
  const pass = Deno.env.get("SMTP_PASS");

  if (!host || !user || !pass) {
    throw new Error("SMTP_HOST, SMTP_USER, and SMTP_PASS must be set in Edge Function secrets.");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

export function getFromAddress(): string {
  return Deno.env.get("SMTP_FROM") ?? "StockPadi <noreply@stockpadi.app>";
}

/** Sends a single email. Throws on SMTP failure — callers decide how to surface it. */
export async function sendMail(options: MailOptions): Promise<void> {
  const transport = createTransport();
  await transport.sendMail({
    from: getFromAddress(),
    ...options,
  });
}
