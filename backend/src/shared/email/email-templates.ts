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
    name: process.env.BUSINESS_NAME || process.env.PLATFORM_NAME || "",
    displayName: process.env.BUSINESS_DISPLAY_NAME || process.env.BUSINESS_NAME || process.env.PLATFORM_NAME || "",
    primaryColor: process.env.BRAND_COLOR || "#0B7A55",
    accentColor: process.env.BRAND_ACCENT || "#F59E0B",
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
<p style="margin:0 0 28px;font-size:16px;font-weight:600;color:#17212b;">${escapeHtml(brand.displayName)}</p>
<div class="content" style="font-size:16px;line-height:1.6;">${bodyHtml}</div>
</td></tr></table>
<p style="max-width:520px;margin:16px 0 0;font-size:12px;line-height:1.5;color:#64748b;">This is an automated account email. Please do not reply.</p>
</td></tr></table></body></html>`;
}

/**
 * Verification Code Email (6-digit OTP)
 */
export function renderVerificationEmail(fullName: string, code: string): RenderedEmail {
  const brand = getBrandConfig();
  const safeName = escapeHtml(fullName);
  const safeCode = escapeHtml(code);
  const subject = `Your ${brand.displayName} code`;

  const text = `Hi ${fullName},\n\nYour ${brand.displayName} code is: ${code}\n\nIt expires in 30 minutes. Never share it with anyone.`;

  const bodyHtml = `
    <h2>Verify your email</h2>
    <p>Hi ${safeName}, enter this code in ${escapeHtml(brand.displayName)} to verify your email address.</p>
    <p style="margin:24px 0;padding:20px 12px;background:#f6f7f8;border:1px solid #e2e6e9;border-radius:6px;text-align:center;font-family:Consolas,monospace;font-size:30px;letter-spacing:6px;color:#17212b;">${safeCode}</p>
    <p>Valid for 30 minutes. Never share this code with anyone.</p>
    <p><a href="${escapeHtml(getFrontendUrl())}/verify-email" class="btn">Verify email</a></p>
  `;

  return {
    subject,
    text,
    html: baseTemplate(subject, bodyHtml),
  };
}

function getFrontendUrl(): string {
  const origin = process.env.FRONTEND_ORIGIN || process.env.FRONTEND_ORIGINS?.split(",")[0] || process.env.SITE_URL || (process.env.NODE_ENV === "production" ? "" : "http://localhost:3000");
  return origin.trim().replace(/\/$/, "");
}

/** Welcome email sent after platform-admin approval succeeds. */
export function renderWelcomeEmail(fullName: string, storeName: string): RenderedEmail {
  const brand = getBrandConfig();
  const safeName = escapeHtml(fullName);
  const safeStore = escapeHtml(storeName);
  const subject = `Your ${brand.displayName} store is approved`;
  const dashboardUrl = `${getFrontendUrl()}/dashboard`;

  const text = `Hi ${fullName},\n\nThank you for choosing ${brand.displayName}. ${storeName} has been approved.\n\nSign in to continue to your dashboard. If your email is not yet verified, you will be asked to complete that security step first.\n\nWelcome aboard!`;

  const bodyHtml = `
    <h2 style="margin-top:0; color:#0f172a; font-size:20px;">Your store is approved</h2>
    <p>Hi <strong>${safeName}</strong>,</p>
    <p>Thank you for choosing ${escapeHtml(brand.displayName)}. Your store <strong>${safeStore}</strong> has been approved.</p>
    <p>Sign in to continue. If your email is not yet verified, you will be asked to complete that security step before the dashboard opens.</p>

    <p>You can add products, invite your team and start recording sales from your dashboard.</p>

    <p style="text-align: center;">
      <a href="${escapeHtml(dashboardUrl)}" class="btn">Go to ${escapeHtml(brand.displayName)} Dashboard &rarr;</a>
    </p>
  `;

  return {
    subject,
    text,
    html: baseTemplate(subject, bodyHtml),
  };
}

/** Platform-admin notification after a new owner/store has been provisioned. */
export function renderNewSignupAdminEmail(input: {
  ownerName: string;
  ownerEmail: string;
  storeName: string;
  businessType: string;
  businessId: string;
}): RenderedEmail {
  const brand = getBrandConfig();
  const adminUrl = `${getFrontendUrl()}/admin/businesses/${encodeURIComponent(input.businessId)}`;
  const subject = `New ${brand.displayName} store awaiting approval`;
  const text = `A new store is awaiting approval.\n\nStore: ${input.storeName}\nOwner: ${input.ownerName}\nEmail: ${input.ownerEmail}\nBusiness type: ${input.businessType}\n\nReview: ${adminUrl}`;
  const bodyHtml = `
    <h2 style="margin-top:0; color:#0f172a; font-size:20px;">New store awaiting approval</h2>
    <p>A new owner completed signup and is waiting for platform review.</p>
    <div class="credential-box">
      <div class="credential-row"><strong>Store:</strong> ${escapeHtml(input.storeName)}</div>
      <div class="credential-row"><strong>Owner:</strong> ${escapeHtml(input.ownerName)}</div>
      <div class="credential-row"><strong>Email:</strong> ${escapeHtml(input.ownerEmail)}</div>
      <div class="credential-row"><strong>Business type:</strong> ${escapeHtml(input.businessType)}</div>
    </div>
    <p style="text-align:center;"><a href="${escapeHtml(adminUrl)}" class="btn">Review signup &rarr;</a></p>
  `;
  return { subject, text, html: baseTemplate(subject, bodyHtml) };
}

/** Worker Invite Notification Email: no password (shared out-of-band by the owner). */
export function renderWorkerInviteEmail(name: string, email: string): RenderedEmail {
  const brand = getBrandConfig();
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const subject = `Your ${brand.displayName} worker access`;
  const loginUrl = `${getFrontendUrl()}/login`;

  const text = `Hi ${name},\n\nYou have been added as a worker on ${brand.displayName}.\n\nLogin Email: ${email}\n\nPlease ask your store manager for your login details.`;

  const bodyHtml = `
    <h2 style="margin-top:0; color:#0f172a; font-size:20px;">Worker account access</h2>
    <p>Hi <strong>${safeName}</strong>,</p>
    <p>You have been invited to access your store's ${escapeHtml(brand.displayName)} workspace.</p>

    <div class="credential-box">
      <div class="credential-row">
        <strong>Login Email:</strong> <span style="color:#0f172a;">${safeEmail}</span>
      </div>
    </div>

    <div class="security-note">
      <strong>Security Note:</strong> For your security, your password is never sent by email. Ask your store manager for your login details and keep them confidential.
    </div>

    <p style="text-align: center;">
      <a href="${escapeHtml(loginUrl)}" class="btn">Log In to ${escapeHtml(brand.displayName)} &rarr;</a>
    </p>
  `;

  return {
    subject,
    text,
    html: baseTemplate(subject, bodyHtml),
  };
}

/** Worker Password Changed Notification Email: no password (shared out-of-band by the owner). */
export function renderWorkerPasswordChangedEmail(email: string): RenderedEmail {
  const brand = getBrandConfig();
  const safeEmail = escapeHtml(email);
  const subject = `Your ${brand.displayName} password was updated`;

  const text = `Your ${brand.displayName} account (${email}) password was successfully updated.\n\nIf you did not request this change, please contact your store manager immediately.`;

  const bodyHtml = `
    <h2 style="margin-top:0; color:#0f172a; font-size:20px;">Password changed</h2>
    <p>The password for your ${escapeHtml(brand.displayName)} account (<strong>${safeEmail}</strong>) has been updated.</p>
    <p>For your security, the new password was not sent by email. Ask your store manager for it.</p>

    <div class="security-note" >
      <strong>Didn't request this?</strong> If you did not update your password, contact your store manager immediately to secure your account.
    </div>
  `;

  return {
    subject,
    text,
    html: baseTemplate(subject, bodyHtml),
  };
}
