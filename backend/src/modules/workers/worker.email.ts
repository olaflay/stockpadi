import { sendEmail } from "../../shared/email/mailer.js";
import { renderWorkerInviteEmail, renderWorkerPasswordChangedEmail } from "../../shared/email/email-templates.js";

/**
 * Worker notification emails deliberately omit the password.
 * The generated password is returned to the owner in the API response and
 * shared out-of-band (WhatsApp / in person), never over the insecure email
 * channel. See worker.service.ts for the response shape.
 */

export function sendInvite(email: string, name: string) {
  const rendered = renderWorkerInviteEmail(name, email);
  return sendEmail({ to: email, ...rendered });
}

export function sendPassword(email: string) {
  const rendered = renderWorkerPasswordChangedEmail(email);
  return sendEmail({ to: email, ...rendered });
}
