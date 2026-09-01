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
    const error = registrationCreationError({ code: "unexpected_failure", message: "provider detail" });

    expect(error.status).toBe(502);
    expect(error.code).toBe("AUTH_CREATE_FAILED");
  });
});
