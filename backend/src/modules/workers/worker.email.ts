import { sendEmail } from "../../shared/email/mailer.js";

export function sendInvite(email: string, name: string, password: string) {
  return sendEmail({ to: email, subject: "Your StockPadi worker access", text: `Your StockPadi login email is ${email}. Password: ${password}.`, html: `<h2>StockPadi worker access</h2><p>Hi ${name},</p><p>Login email: <b>${email}</b><br>Password: <b>${password}</b></p><p>Keep these details private.</p>` });
}

export function sendPassword(email: string, password: string) {
  return sendEmail({ to: email, subject: "Your StockPadi password was changed", text: `Your new StockPadi password is ${password}.`, html: `<h2>Your StockPadi password was changed</h2><p>New password: <b>${password}</b></p><p>Keep it private.</p>` });
}
