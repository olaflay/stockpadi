/**
 * KEEP IN SYNC with supabase/functions/_shared/mailer.ts (the Deno Edge Function copy).
 * Same provider logic, different runtime globals (process.env here vs Deno.env there).
 * Change the sender format or add a provider in BOTH copies.
 */
import nodemailer from "nodemailer";

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
  from?: string;
  replyTo?: string;
}

export interface EmailConfigStatus {
  configured: boolean;
  provider: "brevo-api" | "brevo-smtp" | "smtp" | "none";
  senderEmail: string;
  senderName: string;
  details: string;
}

/** Parses "Sender Name <sender@example.com>" or "sender@example.com" into name & email */
export function parseSenderAddress(rawFrom?: string): { name: string; email: string } {
  const fromStr = rawFrom || process.env.BREVO_SENDER_EMAIL || process.env.SMTP_FROM || "StockPadi <noreply@stockpadi.app>";
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

/** Validates email configuration status and identifies active provider */
export function validateEmailConfig(): EmailConfigStatus {
  const sender = parseSenderAddress();

  if (process.env.BREVO_API_KEY) {
    return {
      configured: true,
      provider: "brevo-api",
      senderEmail: sender.email,
      senderName: sender.name,
      details: "Brevo REST API v3 active via BREVO_API_KEY",
    };
  }

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const url = process.env.SMTP_URL;
  const service = process.env.SMTP_SERVICE;

  if (host?.includes("brevo.com") || host?.includes("sendinblue.com")) {
    const ready = Boolean(user && pass);
    return {
      configured: ready,
      provider: "brevo-smtp",
      senderEmail: sender.email,
      senderName: sender.name,
      details: ready ? `Brevo SMTP Relay active (${host})` : "Brevo SMTP host set but SMTP_USER or SMTP_PASS is missing",
    };
  }

  if (url || (service && user && pass) || (host && user && pass)) {
    return {
      configured: true,
      provider: "smtp",
      senderEmail: sender.email,
      senderName: sender.name,
      details: `Standard SMTP active (${host || service || "SMTP_URL"})`,
    };
  }

  return {
    configured: false,
    provider: "none",
    senderEmail: sender.email,
    senderName: sender.name,
    details: "No email provider configured. Set BREVO_API_KEY, SMTP_HOST/USER/PASS, or SMTP_URL.",
  };
}

/** Transporter for standard SMTP / Brevo SMTP Relay */
function createTransporter() {
  const smtpUrl = process.env.SMTP_URL;
  if (smtpUrl) {
    return nodemailer.createTransport(smtpUrl);
  }

  const service = process.env.SMTP_SERVICE;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (service && user && pass) {
    return nodemailer.createTransport({
      service,
      auth: { user, pass },
    });
  }

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : (host?.includes("brevo.com") ? 587 : 587);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
  }

  return null;
}

const transporter = createTransporter();

/** Sends email via Brevo REST API v3 */
async function sendViaBrevoApi(input: SendEmailInput, sender: { name: string; email: string }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error("BREVO_API_KEY is missing");
  }

  const payload = {
    sender: { name: sender.name, email: sender.email },
    to: [{ email: input.to }],
    subject: input.subject,
    htmlContent: input.html,
    textContent: input.text,
    ...(input.replyTo ? { replyTo: { email: input.replyTo } } : {}),
  };

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "accept": "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status} ${response.statusText}`;
    try {
      const errBody = await response.json();
      if (errBody?.message) {
        errorDetail = `[${errBody.code || response.status}] ${errBody.message}`;
      }
    } catch {
      // Ignore JSON parse error
    }

    if (response.status === 400 && errorDetail.includes("sender")) {
      throw new Error(`Brevo delivery rejected: ${errorDetail}. Ensure '${sender.email}' is added and verified as a sender in your Brevo dashboard.`);
    }

    throw new Error(`Brevo API delivery failed: ${errorDetail}`);
  }

  return await response.json();
}

/**
 * Primary email dispatcher supporting Brevo REST API v3, Brevo SMTP Relay, and standard SMTP.
 */
export async function sendEmail(input: SendEmailInput) {
  const sender = parseSenderAddress(input.from);

  // 1. Brevo REST API v3 Priority
  if (process.env.BREVO_API_KEY) {
    return await sendViaBrevoApi(input, sender);
  }

  // 2. Nodemailer SMTP (Brevo SMTP or custom SMTP)
  if (!transporter) {
    const configStatus = validateEmailConfig();
    throw new Error(`Email sending failed: ${configStatus.details}`);
  }

  const fromFormatted = input.from || `${sender.name} <${sender.email}>`;

  try {
    return await transporter.sendMail({
      from: fromFormatted,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("550") || errorMessage.toLowerCase().includes("sender")) {
      throw new Error(`SMTP delivery rejected: ${errorMessage}. Verify that '${sender.email}' is authorized by your mail provider (e.g., Brevo Sender list).`);
    }
    throw error;
  }
}
