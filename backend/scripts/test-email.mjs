import { sendEmail, validateEmailConfig } from "../dist/src/shared/email/mailer.js";
import { renderVerificationEmail } from "../dist/src/shared/email/email-templates.js";

async function main() {
  const recipient = process.argv[2];

  if (!recipient) {
    console.log("Usage: node --env-file=.env scripts/test-email.mjs <recipient-email>");
    console.log("Example: node --env-file=.env scripts/test-email.mjs user@example.com");
    process.exit(1);
  }

  console.log("=== StockPadi Brevo / SMTP Email Delivery Test ===");

  const status = validateEmailConfig();
  console.log(`Configured:   ${status.configured ? "YES" : "NO"}`);
  console.log(`Provider:     ${status.provider.toUpperCase()}`);
  console.log(`Sender Name:  ${status.senderName}`);
  console.log(`Sender Email: ${status.senderEmail}`);
  console.log(`Details:      ${status.details}`);
  console.log(`Recipient:    ${recipient}`);

  if (!status.configured) {
    console.error("\n❌ Error: Email is not configured.");
    console.error("To fix this, set one of the following in your backend/.env file:");
    console.error("  Option A (Recommended): BREVO_API_KEY=your-brevo-api-key");
    console.error("  Option B: SMTP_HOST=smtp-relay.brevo.com, SMTP_PORT=587, SMTP_USER=your-user, SMTP_PASS=your-key");
    process.exit(1);
  }

  try {
    console.log(`\nSending styled Brevo test email to ${recipient}...`);
    const rendered = renderVerificationEmail("StockPadi Tester", "849201");

    const result = await sendEmail({
      to: recipient,
      ...rendered,
    });

    console.log("\n✅ Email sent successfully!");
    console.log("Result:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("\n❌ Delivery failed:", error instanceof Error ? error.message : error);
    if (String(error).includes("sender")) {
      console.error("\n💡 Brevo Troubleshooting Tip:");
      console.error(`Make sure '${status.senderEmail}' is added and verified in your Brevo Dashboard -> Senders & IP.`);
    }
  }
}

main();
