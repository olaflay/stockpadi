import { describe, expect, it } from "vitest";
import { emailDeliveryHttpError } from "./email-verification.service.js";

describe("emailDeliveryHttpError", () => {
  it.each([
    ["Email sending failed: No email provider configured", 503, "MAIL_NOT_CONFIGURED"],
    ["SMTP 550 sender rejected", 502, "MAIL_SENDER_REJECTED"],
    ["HTTP 401 unauthorized", 502, "MAIL_PROVIDER_AUTH_FAILED"],
    ["HTTP 429 rate limit", 429, "MAIL_PROVIDER_RATE_LIMITED"],
  ])("maps provider failure without exposing its detail: %s", (detail, status, code) => {
    const error = emailDeliveryHttpError(new Error(detail));

    expect(error.status).toBe(status);
    expect(error.code).toBe(code);
    expect(error.message).not.toContain(detail);
  });

  it("uses a safe fallback for unknown delivery failures", () => {
    const error = emailDeliveryHttpError(new Error("private provider failure"));

    expect(error.status).toBe(502);
    expect(error.code).toBe("MAIL_FAILED");
    expect(error.message).not.toContain("private provider failure");
  });
});
