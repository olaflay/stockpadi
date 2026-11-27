/**
 * Transactional HTML and plain-text email templates
 *
 * KEEP IN SYNC with supabase/functions/_shared/email-templates.ts (Deno copy) for the
 * shared functions (renderVerificationEmail, renderWelcomeEmail). This Node copy also
 * holds the worker invite / password-changed templates used only by the backend.
 *
 * Designed with universal email client compatibility (Gmail, Outlook, Apple Mail, mobile screens).
 * Uses configured branding and responsive table structures.
 */

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export interface BrandEmailConfig {
  name: string;
  displayName: string;
  primaryColor: string;
  accentColor: string;
}

export function getBrandConfig(): BrandEmailConfig {
  return {
    name: Deno.env.get("BUSINESS_NAME") || Deno.env.get("PLATFORM_NAME") || "",
    displayName: Deno.env.get("BUSINESS_DISPLAY_NAME") || Deno.env.get("BUSINESS_NAME") || Deno.env.get("PLATFORM_NAME") || "",
    primaryColor: Deno.env.get("BRAND_COLOR") || "#0B7A55",
    accentColor: Deno.env.get("BRAND_ACCENT") || "#F59E0B",
  };
}

/** Escapes special HTML characters to prevent XSS/injection in email bodies */
export function escapeHtml(value: string): string {
  if (!value) return "";
  return value.replace(/[&<>'"]/g, (ch) => {
    switch (ch) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "'": return "&#39;";
      case '"': return "&quot;";
      default: return ch;
    }
  });
}

/** Colored table cells keep the ornament visible with image downloads disabled. */
function documentMotif(color: string): string {
  const tiles = [
    [0, 0, 0, 1, 2],
    [0, 0, 1, 2, 1],
    [1, 1, 2, 1, 0],
  ];
  const channels = [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16));
  const tint = (opacity: number) => "#" + channels
    .map((channel) => Math.round(255 + (channel - 255) * opacity).toString(16).padStart(2, "0"))
    .join("");
  const shades = ["", tint(0.24), tint(0.78)];
  const rows = tiles.map((row) => {
    const cells = row.map((tile) => {
      const background = tile ? ` bgcolor="${shades[tile]}"` : "";
      return `<td width="8" height="8"${background} style="width:8px;height:8px;font-size:1px;line-height:1px;">&nbsp;</td>`;
    });
    return `<tr>${cells.join("")}</tr>`;
  }).join("");
  return `<table role="presentation" aria-hidden="true" class="document-motif" cellspacing="2" cellpadding="0" style="border-collapse:separate;border-spacing:2px;">${rows}</table>`;
}

/** One minimal, table-based layout shared by every transactional email. */
function baseTemplate(title: string, bodyHtml: string): string {
  const brand = getBrandConfig();
  const color = /^#[0-9a-f]{6}$/i.test(brand.primaryColor) ? brand.primaryColor : "#0B7A55";
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
body { margin:0; background:#f6f7f8; color:#17212b; font-family:Arial,Helvetica,sans-serif; }
table { border-collapse:collapse; }
p { margin:0 0 16px; }
h2 { margin:0 0 20px; font-size:22px; line-height:1.3; color:#17212b; }
.content { font-size:16px; line-height:1.6; overflow-wrap:anywhere; }
.btn { display:inline-block; padding:12px 20px; border-radius:6px; background:${color}; color:#fff !important; font-size:16px; font-weight:600; text-decoration:none; }
.credential-box, .security-note { margin:20px 0; padding:16px; background:#f6f7f8; border:1px solid #e2e6e9; border-radius:6px; }
.security-note { font-size:14px; color:#475569; }
@media (max-width:480px) { .email-content { padding:24px 20px !important; } }
</style></head>
<body style="margin:0;background:#f6f7f8;font-family:Arial,Helvetica,sans-serif;color:#17212b;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="width:100%;max-width:520px;background:#fff;border:1px solid #e2e6e9;border-radius:8px;">
<tr><td class="email-content" style="padding:32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td valign="middle" style="padding:0 16px 22px 0;font-size:17px;font-weight:bold;color:#17212b;word-break:break-word;">${escapeHtml(brand.displayName)}</td>
<td width="52" align="right" valign="middle" style="padding-bottom:22px;">${documentMotif(color)}</td>
</tr></table>
<div class="content" style="font-size:16px;line-height:1.6;">${bodyHtml}</div>
</td></tr></table>
<p style="max-width:520px;margin:16px 0 0;font-size:12px;line-height:1.5;color:#64748b;">This is an automated account email. Please do not reply.</p>
</td></tr></table></body></html>`;
}

function emailAction(url: string, label: string): string {
  const color = getBrandConfig().primaryColor;
  const background = /^#[0-9a-f]{6}$/i.test(color) ? color : "#0B7A55";
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td bgcolor="${background}" style="border-radius:6px;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;color:#fff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;text-decoration:none;">${escapeHtml(label)}</a></td></tr></table>`;
}

/**
 * Verification Code Email (6-digit OTP)
 */
export function renderVerificationEmail(fullName: string, code: string): RenderedEmail {
  const brand = getBrandConfig();
  const safeName = escapeHtml(fullName);
  const safeCode = escapeHtml(code);
  const subject = brand.displayName ? `Your ${brand.displayName} verification code` : "Your verification code";

  const text = `Hi ${fullName},\n\nEnter this code on the email verification screen:\n\n${code}\n\nThis code expires in 30 minutes. Keep it private. If you didn’t create an account, you can ignore this email.`;

  const bodyHtml = `
    <h2>Verify your email</h2>
    <p>Hi ${safeName}, enter this code on the email verification screen.</p>
    <p style="margin:24px 0;padding:20px 12px;background:#f6f7f8;border:1px solid #e2e6e9;border-radius:6px;text-align:center;font-family:Consolas,monospace;font-size:32px;font-weight:bold;letter-spacing:4px;color:#17212b;">${safeCode}</p>
    <p>This code expires in <strong>30 minutes</strong>. Keep it private.</p>
    <p style="margin:0;font-size:14px;color:#475569;">If you didn’t create an account, you can ignore this email.</p>
  `;

  return {
    subject,
    text,
    html: baseTemplate(subject, bodyHtml),
  };
}

function getFrontendUrl(): string {
  const origin = Deno.env.get("FRONTEND_ORIGIN") || Deno.env.get("FRONTEND_ORIGINS")?.split(",")[0] || Deno.env.get("SITE_URL") || (Deno.env.get("NODE_ENV") === "production" ? "" : "http://localhost:3000");
  return origin.trim().replace(/\/$/, "");
}

function accountUrl(path: string): string {
  const origin = new URL(getFrontendUrl());
  const allowsLocalHttp = Deno.env.get("NODE_ENV") !== "production" && origin.protocol === "http:";
  if ((!allowsLocalHttp && origin.protocol !== "https:") || origin.username || origin.password) {
    throw new Error("Configure FRONTEND_ORIGIN with the HTTPS frontend URL for account email links.");
  }
  return new URL(path, origin).href;
}

/** Welcome email sent after platform-admin approval succeeds. */
export function renderWelcomeEmail(fullName: string, storeName: string): RenderedEmail {
  const brand = getBrandConfig();
  const safeName = escapeHtml(fullName);
  const safeStore = escapeHtml(storeName);
  const subject = brand.displayName ? `Your ${brand.displayName} store is approved` : "Your store is approved";
  const loginUrl = accountUrl("/login");

  const text = `Hi ${fullName},\n\n${storeName} has been approved. Sign in to set up your store and start recording sales.\n\nSign in: ${loginUrl}\n\nIf you still need to verify your email, you can do that after signing in.`;

  const bodyHtml = `
    <h2>Your store is approved</h2>
    <p>Hi ${safeName},</p>
    <p><strong>${safeStore}</strong> has been approved. Sign in to set up your store and start recording sales.</p>
    ${emailAction(loginUrl, "Sign in")}
    <p style="margin:0;font-size:14px;color:#475569;">If you still need to verify your email, you can do that after signing in.</p>
  `;

  return {
    subject,
    text,
    html: baseTemplate(subject, bodyHtml),
  };
}
