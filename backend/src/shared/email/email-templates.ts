/**
 * OjàPadi HTML & Plain Text Email Templates
 *
 * KEEP IN SYNC with supabase/functions/_shared/email-templates.ts (Deno copy) for the
 * shared functions (renderVerificationEmail, renderWelcomeEmail). This Node copy also
 * holds the worker invite / password-changed templates used only by the backend.
 *
 * Designed with universal email client compatibility (Gmail, Outlook, Apple Mail, mobile screens).
 * Uses dynamic brand colors (Ojà Emerald #0B7A55), clean typography, high contrast,
 * and responsive table structures.
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
    name: process.env.BUSINESS_NAME || process.env.PLATFORM_NAME || "OjaPadi",
    displayName: process.env.BUSINESS_DISPLAY_NAME || "OjàPadi",
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

/** Base layout container wrapping email content cards */
function baseTemplate(title: string, bodyHtml: string): string {
  const brand = getBrandConfig();
  const safeBrandDisplay = escapeHtml(brand.displayName);

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(title)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    *, *:before, *:after {
      box-sizing: border-box !important;
      -webkit-box-sizing: border-box !important;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      min-width: 100% !important;
      background-color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      -ms-text-size-adjust: 100%;
      -webkit-text-size-adjust: 100%;
      color: #0f172a;
      overflow-x: hidden !important;
    }
    table {
      border-collapse: collapse !important;
      mso-table-lspace: 0pt !important;
      mso-table-rspace: 0pt !important;
      table-layout: fixed !important;
      width: 100% !important;
    }
    img {
      border: 0;
      outline: none;
      text-decoration: none;
      -ms-interpolation-mode: bicubic;
    }
    p, a, li, td, body {
      mso-line-height-rule: exactly;
    }
    .wrapper-table {
      width: 100% !important;
      max-width: 100% !important;
      background-color: #f1f5f9;
      margin: 0 auto;
      padding: 24px 8px;
    }
    .card-table {
      width: 100% !important;
      max-width: 520px !important;
      background-color: #ffffff;
      border-radius: 16px;
      border: 1px solid #e2e8f0;
      overflow: hidden;
      margin: 0 auto;
      box-shadow: 0 4px 12px -2px rgba(15, 23, 42, 0.05);
    }
    .top-accent-bar {
      height: 4px;
      background-color: ${brand.primaryColor};
      width: 100%;
      font-size: 1px;
      line-height: 1px;
    }
    .card-inner {
      padding: 32px 24px;
      width: 100%;
    }
    .brand-badge {
      display: inline-block;
      background-color: ${brand.primaryColor};
      color: #ffffff !important;
      font-weight: 800;
      font-size: 15px;
      padding: 6px 14px;
      border-radius: 8px;
      letter-spacing: 0.5px;
      text-decoration: none;
    }
    .subhead {
      margin-top: 6px;
      font-size: 11px;
      color: #64748b;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .content {
      font-size: 15px;
      line-height: 1.6;
      color: #334155;
      word-break: break-word;
      overflow-wrap: break-word;
    }
    .code-box {
      background-color: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      padding: 20px 16px;
      text-align: center;
      margin: 22px 0;
      width: 100%;
      max-width: 100%;
    }
    .code-text {
      font-family: 'SF Mono', Consolas, Monaco, 'Courier New', monospace;
      font-size: 28px;
      font-weight: 800;
      letter-spacing: 6px;
      color: ${brand.primaryColor};
      line-height: 1.2;
      display: block;
      margin-bottom: 8px;
    }
    .badge {
      display: inline-block;
      background-color: #ecfdf5;
      color: #065f46;
      font-size: 12px;
      font-weight: 600;
      padding: 3px 12px;
      border-radius: 9999px;
      border: 1px solid #a7f3d0;
    }
    .credential-box {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-left: 4px solid ${brand.primaryColor};
      border-radius: 8px;
      padding: 14px 16px;
      margin: 20px 0;
      word-break: break-word;
    }
    .credential-row {
      font-size: 14px;
      color: #334155;
    }
    .btn-table {
      margin: 24px auto 8px auto;
      width: auto !important;
    }
    .btn-cell {
      border-radius: 8px;
      background-color: ${brand.primaryColor};
      text-align: center;
    }
    .btn {
      display: inline-block;
      background-color: ${brand.primaryColor};
      color: #ffffff !important;
      font-weight: 600;
      font-size: 14px;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 8px;
      border: 1px solid ${brand.primaryColor};
      text-align: center;
    }
    .security-note {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 14px;
      font-size: 13px;
      color: #64748b;
      margin-top: 22px;
      line-height: 1.5;
    }
    .footer {
      text-align: center;
      padding: 24px 16px 0 16px;
      font-size: 12px;
      color: #94a3b8;
      line-height: 1.5;
      max-width: 520px;
      margin: 0 auto;
    }
    @media only screen and (max-width: 480px) {
      .card-inner {
        padding: 24px 16px !important;
      }
      .code-text {
        font-size: 24px !important;
        letter-spacing: 4px !important;
      }
    }
  </style>
</head>
<body>
  <table role="presentation" class="wrapper-table" border="0" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding: 0;">
        <table role="presentation" class="card-table" border="0" cellpadding="0" cellspacing="0">
          <tr>
            <td class="top-accent-bar">&nbsp;</td>
          </tr>
          <tr>
            <td class="card-inner">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 24px; border-bottom: 1px solid #f1f5f9; padding-bottom: 18px;">
                <tr>
                  <td align="center">
                    <div class="brand-badge">${safeBrandDisplay}</div>
                    <div class="subhead">Smart Retail & Point of Sale</div>
                  </td>
                </tr>
              </table>
              <div class="content">
                ${bodyHtml}
              </div>
            </td>
          </tr>
        </table>
        <table role="presentation" class="footer" border="0" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center">
              &copy; ${new Date().getFullYear()} ${safeBrandDisplay}. All rights reserved.<br>
              This is an automated security email. Please do not reply directly.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
    <h2 style="margin-top: 0; margin-bottom: 6px; color: #0f172a; font-size: 22px; font-weight: 800; text-align: center; letter-spacing: -0.5px;">
      Your 6-digit code
    </h2>
    <p style="margin: 0 0 20px 0; color: #475569; font-size: 14px; text-align: center; line-height: 1.5;">
      Hi <strong>${safeName}</strong>, enter this code in ${escapeHtml(brand.displayName)} to activate your shop:
    </p>

    <!-- Copy-Paste OTP Plaque -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 22px auto; width: 100%; max-width: 360px;">
      <tr>
        <td align="center" style="background-color: #f0fdf4; border: 1.5px solid #86efac; border-radius: 16px; padding: 22px 20px; box-shadow: 0 4px 14px rgba(11, 122, 85, 0.07);">
          <div style="font-size: 11px; font-weight: 700; color: #047857; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px;">
            Your code
          </div>
          <div style="font-family: 'SF Mono', Consolas, Monaco, 'Courier New', monospace; font-size: 38px; font-weight: 800; letter-spacing: 14px; padding-left: 14px; color: #064e3b; line-height: 1.2; user-select: all; -webkit-user-select: all; word-break: keep-all; white-space: nowrap;">
            ${safeCode}
          </div>
          <div style="font-size: 12px; color: #059669; font-weight: 600; margin-top: 8px;">
            Tap or double-click to copy
          </div>
        </td>
      </tr>
    </table>

    <p style="font-size: 13px; color: #64748b; text-align: center; margin: 0 0 20px 0; line-height: 1.5;">
      Valid for <strong>30 minutes</strong>. Never share this code with anyone.
    </p>

    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 20px auto 14px auto;">
      <tr>
        <td align="center" style="border-radius: 10px; background-color: ${brand.primaryColor};">
          <a href="${getFrontendUrl()}/verify-email" style="display: inline-block; padding: 13px 32px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; font-weight: 700; color: #ffffff !important; text-decoration: none; border-radius: 10px;">Open ${escapeHtml(brand.displayName)} &rarr;</a>
        </td>
      </tr>
    </table>
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

/** Welcome Email after verification completes */
export function renderWelcomeEmail(fullName: string, storeName: string): RenderedEmail {
  const brand = getBrandConfig();
  const safeName = escapeHtml(fullName);
  const safeStore = escapeHtml(storeName);
  const subject = `Your ${brand.displayName} store is ready!`;
  const dashboardUrl = `${getFrontendUrl()}/dashboard`;

  const text = `Hi ${fullName},\n\nCongratulations! Your email is verified and ${storeName} is ready to use.\n\nYou can now log in to add inventory, set up staff accounts, and process sales.\n\nWelcome aboard!`;

  const bodyHtml = `
    <h2 style="margin-top:0; color:#0f172a; font-size:20px;">Welcome to ${escapeHtml(brand.displayName)}!</h2>
    <p>Hi <strong>${safeName}</strong>,</p>
    <p>Your email is verified and your store <strong>${safeStore}</strong> is now active and ready for business.</p>

    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 20px 0; color: #166534;">
      <strong style="font-size: 15px;">Store Setup Checklist:</strong>
      <ul style="margin: 8px 0 0 0; padding-left: 20px; line-height: 1.6;">
        <li>Add products and stock quantities</li>
        <li>Invite team workers & set branch roles</li>
        <li>Start recording Point of Sale transactions</li>
      </ul>
    </div>

    <p style="text-align: center;">
      <a href="${dashboardUrl}" class="btn">Go to ${escapeHtml(brand.displayName)} Dashboard &rarr;</a>
    </p>
  `;

  return {
    subject,
    text,
    html: baseTemplate(subject, bodyHtml),
  };
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
    <h2 style="margin-top:0; color:#0f172a; font-size:20px;">Worker Account Access</h2>
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
      <a href="${loginUrl}" class="btn">Log In to ${escapeHtml(brand.displayName)} &rarr;</a>
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
    <h2 style="margin-top:0; color:#0f172a; font-size:20px;">Password Changed</h2>
    <p>The password for your ${escapeHtml(brand.displayName)} account (<strong>${safeEmail}</strong>) has been updated.</p>
    <p>For your security, the new password was not sent by email. Ask your store manager for it.</p>

    <div class="security-note" style="border-left: 3px solid #ef4444; background-color: #fef2f2; color: #991b1b;">
      <strong>Didn't request this?</strong> If you did not update your password, contact your store manager immediately to secure your account.
    </div>
  `;

  return {
    subject,
    text,
    html: baseTemplate(subject, bodyHtml),
  };
}
