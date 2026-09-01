import { describe, expect, it } from "vitest";
import { registrationCreationError } from "./business.service.js";

describe("registrationCreationError", () => {
  it.each(["email_exists", "user_already_exists"])("maps %s to a useful conflict", (code) => {
    const error = registrationCreationError({ code, message: "provider detail" });

    expect(error.status).toBe(409);
    expect(error.code).toBe("EMAIL_ALREADY_REGISTERED");
    expect(error.message).toBe("An account with this email already exists. Sign in instead.");
  });

  it("does not misreport other provider failures as duplicate emails", () => {
    const error = registrationCreationError({ code: "provider_unavailable", message: "provider detail" });

    expect(error.status).toBe(502);
    expect(error.code).toBe("AUTH_CREATE_FAILED");
  });

  it.each([
    ["weak_password", 400, "AUTH_VALIDATION_FAILED"],
    ["validation_failed", 400, "AUTH_VALIDATION_FAILED"],
    ["email_provider_disabled", 503, "EMAIL_SIGNUP_DISABLED"],
    ["unexpected_failure", 502, "AUTH_DATABASE_ERROR"],
  ])("maps %s without exposing provider details", (code, status, expectedCode) => {
    const error = registrationCreationError({ code, message: "private provider detail" });

    expect(error.status).toBe(status);
    expect(error.code).toBe(expectedCode);
    expect(error.message).not.toContain("private provider detail");
  });
});
