import nodemailer from "nodemailer";

export async function sendEmail(input: { to: string; subject: string; text: string; html: string }) {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) throw new Error("SMTP is not configured");
  const transport = nodemailer.createTransport({ host, port: Number(process.env.SMTP_PORT ?? 587), secure: process.env.SMTP_SECURE === "true", auth: { user, pass } });
  await transport.sendMail({ from: process.env.SMTP_FROM ?? "StockPadi <noreply@stockpadi.app>", ...input });
}
