/**
 * Shared Nodemailer SMTP & Brevo API transport factory for StockPadi Edge Functions.
 *
 * KEEP IN SYNC with backend/src/shared/email/mailer.ts (the Node backend copy).
 * Same provider logic, different runtime globals (Deno.env here vs process.env there).
 * Change the sender format or add a provider in BOTH copies.
 *
 * Supports both Brevo REST API v3 (BREVO_API_KEY) and SMTP (Brevo, Resend, Gmail, etc.)
 */

// @ts-expect-error: Deno npm import, types resolved at runtime.
import nodemailer from "npm:nodemailer@6";

export interface MailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
  from?: string;
  replyTo?: string;
}

export function parseSenderAddress(rawFrom?: string): { name: string; email: string } {
  const fromStr = rawFrom || Deno.env.get("BREVO_SENDER_EMAIL") || Deno.env.get("SMTP_FROM") || "StockPadi <noreply@stockpadi.app>";
  const match = fromStr.match(/^(?:"?([^"]*)"?\s)?<([^>]+)>$/);
  if (match) {
    return {
      name: match[1]?.trim() || "StockPadi",
      email: match[2]?.trim() || "noreply@stockpadi.app",
    };
  }
  return {
    name: "StockPadi",
    email: fromStr.trim() || "noreply@stockpadi.app",
  };
}

export function createTransport() {
  const host = Deno.env.get("SMTP_HOST");
  const port = parseInt(Deno.env.get("SMTP_PORT") ?? "587", 10);
  const secure = Deno.env.get("SMTP_SECURE") === "true" || port === 465;
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

/** Sends a single email via Brevo API v3 or SMTP */
export async function sendMail(options: MailOptions): Promise<void> {
  const sender = parseSenderAddress(options.from);
  const brevoApiKey = Deno.env.get("BREVO_API_KEY");

  // 1. Brevo REST API v3 Priority
  if (brevoApiKey) {
    const payload = {
      sender: { name: sender.name, email: sender.email },
      to: [{ email: options.to }],
      subject: options.subject,
      htmlContent: options.html,
      textContent: options.text,
      ...(options.replyTo ? { replyTo: { email: options.replyTo } } : {}),
    };

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": brevoApiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson?.message) detail = errJson.message;
      } catch {
        // Ignore JSON error
      }
      throw new Error(`Brevo API delivery error: ${detail}`);
    }
    return;
  }

  // 2. SMTP Transport Fallback
  const transport = createTransport();
  await transport.sendMail({
    from: options.from || getFromAddress(),
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    ...(options.replyTo ? { replyTo: options.replyTo } : {}),
  });
}
