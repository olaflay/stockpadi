import { describe, expect, it } from "vitest";
import { HttpError } from "../../shared/errors/http-error.js";
import { validateRegistration } from "./business.schema.js";

const validRegistration = {
  email: "owner@example.com",
  password: "SecurePass1!",
  fullName: "Business Owner",
  businessName: "Example Store",
  businessTypeId: "general_retail",
};

describe("validateRegistration", () => {
  it("rejects passwords that do not meet the shared strength policy", () => {
    expect(() => validateRegistration({ ...validRegistration, password: "weakpass1!" })).toThrow(HttpError);
    expect(() => validateRegistration({ ...validRegistration, password: "SecurePass!" })).toThrow(HttpError);
    expect(() => validateRegistration({ ...validRegistration, password: "SecurePass1" })).toThrow(HttpError);
  });

  it("accepts a password that meets every requirement", () => {
    expect(() => validateRegistration(validRegistration)).not.toThrow();
  });
});
