/**
 * StockPadi HTML & Plain Text Email Templates
 *
 * KEEP IN SYNC with supabase/functions/_shared/email-templates.ts (Deno copy) for the
 * shared functions (renderVerificationEmail, renderWelcomeEmail). This Node copy also
 * holds the worker invite / password-changed templates used only by the backend.
 *
 * Designed with universal email client compatibility (Gmail, Outlook, Apple Mail, mobile screens).
 * Uses StockPadi brand colors (#0A6E4D Emerald), clean typography, high contrast,
 * and responsive table structures.
 */

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
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
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      color: #0f172a;
    }
    table { border-collapse: collapse; }
    .container {
      width: 100%;
      max-width: 560px;
      margin: 0 auto;
      padding: 32px 16px;
    }
    .card {
      background-color: #ffffff;
      border-radius: 12px;
      border: 1px solid #e2e8f0;
      padding: 32px 28px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    }
    .header {
      text-align: center;
      padding-bottom: 24px;
      border-bottom: 1px solid #f1f5f9;
      margin-bottom: 24px;
    }
    .brand-badge {
      display: inline-block;
      background-color: #0a6e4d;
      color: #ffffff;
      font-weight: 700;
      font-size: 18px;
      padding: 8px 18px;
      border-radius: 8px;
      letter-spacing: 0.5px;
    }
    .subhead {
      margin-top: 6px;
      font-size: 13px;
      color: #64748b;
      font-weight: 500;
    }
    .content {
      font-size: 15px;
      line-height: 1.6;
      color: #334155;
    }
    .code-box {
      background-color: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      margin: 24px 0;
    }
    .code-text {
      font-family: 'Courier New', Courier, monospace;
      font-size: 36px;
      font-weight: 700;
      letter-spacing: 10px;
      color: #0f172a;
    }
    .badge {
      display: inline-block;
      background-color: #fef3c7;
      color: #92400e;
      font-size: 12px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 9999px;
      margin-top: 8px;
    }
    .credential-box {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-left: 4px solid #0a6e4d;
      border-radius: 6px;
      padding: 16px;
      margin: 20px 0;
    }
    .credential-row {
      margin-bottom: 8px;
      font-size: 14px;
    }
    .credential-row:last-child {
      margin-bottom: 0;
    }
    .btn {
      display: inline-block;
      background-color: #0a6e4d;
      color: #ffffff !important;
      font-weight: 600;
      font-size: 14px;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 8px;
      margin-top: 16px;
      text-align: center;
    }
    .security-note {
      background-color: #f8fafc;
      border-radius: 6px;
      padding: 12px 14px;
      font-size: 13px;
      color: #64748b;
      margin-top: 24px;
    }
    .footer {
      text-align: center;
      margin-top: 24px;
      font-size: 12px;
      color: #94a3b8;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="brand-badge">StockPadi</div>
        <div class="subhead">Smart Retail & Point of Sale</div>
      </div>
      <div class="content">
        ${bodyHtml}
      </div>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} StockPadi. All rights reserved.<br>
      This is an automated system email. Please do not reply directly.
    </div>
  </div>
</body>
</html>`;
}

/** Verification Code Email (6-digit OTP) */
export function renderVerificationEmail(fullName: string, code: string): RenderedEmail {
  const safeName = escapeHtml(fullName);
  const subject = "Your StockPadi verification code";

  const text = `Hi ${fullName},\n\nYour StockPadi verification code is: ${code}\n\nThis code expires in 30 minutes. Never share this code with anyone.\n\nIf you did not request this code, please ignore this email.`;

  const bodyHtml = `
    <h2 style="margin-top:0; color:#0f172a; font-size:20px;">Email Verification</h2>
    <p>Hi <strong>${safeName}</strong>,</p>
    <p>Use the 6-digit code below to complete your registration and activate your StockPadi store profile:</p>

    <div class="code-box">
      <div class="code-text">${escapeHtml(code)}</div>
      <div class="badge">&#9200; Valid for 30 minutes</div>
    </div>

    <div class="security-note">
      <strong>&#128274; Security Warning:</strong> Never share this code with anyone. StockPadi staff will never ask for your verification code.
    </div>
  `;

  return {
    subject,
    text,
    html: baseTemplate(subject, bodyHtml),
  };
}

/** Welcome Email after verification completes */
export function renderWelcomeEmail(fullName: string, storeName: string): RenderedEmail {
  const safeName = escapeHtml(fullName);
  const safeStore = escapeHtml(storeName);
  const subject = "Your StockPadi store is ready!";

  const text = `Hi ${fullName},\n\nCongratulations! Your email is verified and ${storeName} is ready to use.\n\nYou can now log in to add inventory, set up staff accounts, and process sales.\n\nWelcome aboard!`;

  const bodyHtml = `
    <h2 style="margin-top:0; color:#0f172a; font-size:20px;">Welcome to StockPadi!</h2>
    <p>Hi <strong>${safeName}</strong>,</p>
    <p>Your email is verified and your store <strong>${safeStore}</strong> is now active and ready for business.</p>

    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 20px 0; color: #166534;">
      <strong style="font-size: 15px;">&#10003; Store Setup Checklist:</strong>
      <ul style="margin: 8px 0 0 0; padding-left: 20px; line-height: 1.6;">
        <li>Add products and stock quantities</li>
        <li>Invite team workers & set branch roles</li>
        <li>Start recording Point of Sale transactions</li>
      </ul>
    </div>

    <p style="text-align: center;">
      <a href="https://stockpadi.app" class="btn">Go to StockPadi Dashboard &rarr;</a>
    </p>
  `;

  return {
    subject,
    text,
    html: baseTemplate(subject, bodyHtml),
  };
}

/** Worker Invite Notification Email — no password (shared out-of-band by the owner). */
export function renderWorkerInviteEmail(name: string, email: string): RenderedEmail {
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const subject = "Your StockPadi worker access";

  const text = `Hi ${name},\n\nYou have been added as a worker on StockPadi.\n\nLogin Email: ${email}\n\nPlease ask your store manager for your login details.`;

  const bodyHtml = `
    <h2 style="margin-top:0; color:#0f172a; font-size:20px;">Worker Account Access</h2>
    <p>Hi <strong>${safeName}</strong>,</p>
    <p>You have been invited to access your store's StockPadi workspace.</p>

    <div class="credential-box">
      <div class="credential-row">
        <strong>Login Email:</strong> <span style="color:#0f172a;">${safeEmail}</span>
      </div>
    </div>

    <div class="security-note">
      <strong>&#128274; Security Note:</strong> For your security, your password is never sent by email. Ask your store manager for your login details and keep them confidential.
    </div>

    <p style="text-align: center;">
      <a href="https://stockpadi.app/login" class="btn">Log In to StockPadi &rarr;</a>
    </p>
  `;

  return {
    subject,
    text,
    html: baseTemplate(subject, bodyHtml),
  };
}

/** Worker Password Changed Notification Email — no password (shared out-of-band by the owner). */
export function renderWorkerPasswordChangedEmail(email: string): RenderedEmail {
  const safeEmail = escapeHtml(email);
  const subject = "Your StockPadi password was updated";

  const text = `Your StockPadi account (${email}) password was successfully updated.\n\nIf you did not request this change, please contact your store manager immediately.`;

  const bodyHtml = `
    <h2 style="margin-top:0; color:#0f172a; font-size:20px;">Password Changed</h2>
    <p>The password for your StockPadi account (<strong>${safeEmail}</strong>) has been updated.</p>
    <p>For your security, the new password was not sent by email — ask your store manager for it.</p>

    <div class="security-note" style="border-left: 3px solid #ef4444; background-color: #fef2f2; color: #991b1b;">
      <strong>&#9888; Didn't request this?</strong> If you did not update your password, contact your store manager immediately to secure your account.
    </div>
  `;

  return {
    subject,
    text,
    html: baseTemplate(subject, bodyHtml),
  };
}
