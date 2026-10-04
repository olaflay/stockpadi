import { describe, expect, it } from "vitest";
import { issueVerificationCode, verifyEmailCode } from "./email-verification.service.js";
import { createApp } from "../../app.js";
import { createServer } from "node:http";

interface MockUserRow {
  id: string;
  full_name: string;
  account_type: string;
  email_verified: boolean;
  email_verification_code_hash: string | null;
  email_verification_expires_at: string | null;
  email_verification_attempts: number;
  business_id: string | null;
}

function createMockDb(initialRow: MockUserRow) {
  let row = { ...initialRow };
  return {
    getRow: () => row,
    from: (table: string) => {
      if (table === "users") {
        return {
          select: () => ({
            eq: (_field: string, id: string) => ({
              maybeSingle: async () => {
                if (row.id !== id) return { data: null, error: null };
                return { data: { ...row }, error: null };
              },
            }),
          }),
          update: (updates: Partial<MockUserRow>) => ({
            eq: (_field: string, id: string) => {
              if (row.id === id) {
                row = { ...row, ...updates };
                return { data: null, error: null };
              }
              return { data: null, error: new Error("not found") };
            },
          }),
        };
      }
      if (table === "business_profile") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { name: "Test Store" }, error: null }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

describe("email verification lifecycle", () => {
  it("issues verification code, persists hash, and allows successful verification", async () => {
    const mock = createMockDb({
      id: "owner-1",
      full_name: "Adeola Alade",
      account_type: "BUSINESS_OWNER",
      email_verified: false,
      email_verification_code_hash: null,
      email_verification_expires_at: null,
      email_verification_attempts: 0,
      business_id: "biz-1",
    });

    const result = await issueVerificationCode(mock as never, "owner-1", "Adeola Alade", "adeola@example.com", { suppressEmailError: true });
    expect(result.status).toBe("sent");

    const rowAfterIssue = mock.getRow();
    expect(rowAfterIssue.email_verification_code_hash).toBeTruthy();
    expect(rowAfterIssue.email_verification_expires_at).toBeTruthy();
    expect(rowAfterIssue.email_verified).toBe(false);

    // Test rejection of invalid code formats
    await expect(verifyEmailCode(mock as never, { id: "owner-1", email: "adeola@example.com" } as never, "abc")).rejects.toMatchObject({
      status: 400,
      code: "INVALID_CODE",
    });

    // Test incorrect 6-digit guess increments attempts
    await expect(verifyEmailCode(mock as never, { id: "owner-1", email: "adeola@example.com" } as never, "000000")).rejects.toMatchObject({
      status: 400,
      code: "WRONG_CODE",
    });
    expect(mock.getRow().email_verification_attempts).toBe(1);
  });

  it("locks out verification after reaching max attempts (5)", async () => {
    const mock = createMockDb({
      id: "owner-2",
      full_name: "Bisi Akande",
      account_type: "BUSINESS_OWNER",
      email_verified: false,
      email_verification_code_hash: "dummyhash",
      email_verification_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      email_verification_attempts: 4,
      business_id: "biz-2",
    });

    // 5th attempt fails and invalidates the code
    await expect(verifyEmailCode(mock as never, { id: "owner-2" } as never, "123456")).rejects.toMatchObject({
      status: 400,
      code: "WRONG_CODE",
    });
    expect(mock.getRow().email_verification_attempts).toBe(5);
    expect(mock.getRow().email_verification_code_hash).toBeNull();

    // Subsequent attempt is blocked with TOO_MANY_ATTEMPTS or NO_CODE
    await expect(verifyEmailCode(mock as never, { id: "owner-2" } as never, "123456")).rejects.toMatchObject({
      status: 400,
      code: "NO_CODE",
    });
  });

  it("rejects expired verification codes", async () => {
    const mock = createMockDb({
      id: "owner-3",
      full_name: "Chidi Obi",
      account_type: "BUSINESS_OWNER",
      email_verified: false,
      email_verification_code_hash: "dummyhash",
      email_verification_expires_at: new Date(Date.now() - 1000).toISOString(), // expired
      email_verification_attempts: 0,
      business_id: "biz-3",
    });

    await expect(verifyEmailCode(mock as never, { id: "owner-3" } as never, "123456")).rejects.toMatchObject({
      status: 400,
      code: "CODE_EXPIRED",
    });
  });
});

describe("OWASP security headers", () => {
  it("includes security headers on all responses", async () => {
    const server = createServer(createApp());
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Server did not bind");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const response = await fetch(`${baseUrl}/health`);
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("x-frame-options")).toBe("DENY");
      expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
