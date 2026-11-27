import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { handleRequest, resetRequestRateLimitForTests } from "../../app.js";
import { sendEmail, validateEmailConfig } from "../../shared/email/mailer.js";
import { supabaseAdmin, supabaseForRecovery } from "../../shared/supabase/client.js";

vi.mock("../../shared/email/mailer.js", () => ({ sendEmail: vi.fn(), validateEmailConfig: vi.fn() }));
vi.mock("../../shared/supabase/client.js", () => ({ supabaseAdmin: vi.fn(), supabaseForRecovery: vi.fn() }));
vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn(async () => undefined) }));

const token = "ab".repeat(28);
const rpc = vi.fn();
const generateLink = vi.fn();
const verifyOtp = vi.fn();
const updateUserById = vi.fn();
const signOut = vi.fn();

const post = (action: "request" | "complete", body: object, authorization = "Bearer unrelated-session") =>
  handleRequest(new Request(`https://api.example.test/api/auth/password/recovery/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization },
    body: JSON.stringify(body),
  }));

beforeEach(() => {
  vi.resetAllMocks();
  resetRequestRateLimitForTests();
  vi.stubEnv("FRONTEND_ORIGIN", "https://app.example.test");
  vi.mocked(validateEmailConfig).mockReturnValue({ configured: true } as never);
  rpc.mockResolvedValue({ data: true });
  generateLink.mockResolvedValue({ data: { properties: { hashed_token: token } }, error: null });
  verifyOtp.mockResolvedValue({ data: { session: { access_token: "recovery-session" }, user: { id: "recovery-owner" } }, error: null });
  updateUserById.mockResolvedValue({ error: null });
  signOut.mockResolvedValue({ error: null });
  vi.mocked(supabaseAdmin).mockReturnValue({ rpc, auth: { admin: { generateLink, updateUserById, signOut } } } as never);
  vi.mocked(supabaseForRecovery).mockReturnValue({ auth: { verifyOtp } } as never);
});

afterEach(() => vi.unstubAllEnvs());

it("sends a link only to the requested address and completes the reset for the verified token owner", async () => {
  const request = await post("request", { email: " OWNER@example.test " });
  expect(request.status).toBe(200);
  expect(await request.json()).toEqual({ ok: true });
  expect(rpc).toHaveBeenCalledWith("claim_password_recovery_request", { p_email_hash: expect.stringMatching(/^[0-9a-f]{64}$/) });
  expect(generateLink).toHaveBeenCalledExactlyOnceWith({ type: "recovery", email: "owner@example.test" });
  expect(sendEmail).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    to: "owner@example.test",
    html: expect.stringContaining(`https://app.example.test/reset-password#token_hash=${token}`),
  }));
  expect(verifyOtp).not.toHaveBeenCalled();

  const complete = await post("complete", { tokenHash: token, password: "StrongerPass1!" });
  expect(complete.status).toBe(200);
  expect(await complete.json()).toEqual({ ok: true });
  expect(verifyOtp).toHaveBeenCalledExactlyOnceWith({ token_hash: token, type: "recovery" });
  expect(updateUserById).toHaveBeenCalledExactlyOnceWith("recovery-owner", { password: "StrongerPass1!" });
  expect(signOut).toHaveBeenCalledExactlyOnceWith("recovery-session", "global");
});

it("returns the same public result for unknown addresses, delivery failure and cooldown", async () => {
  generateLink.mockResolvedValueOnce({ data: { properties: null }, error: { code: "user_not_found" } });
  vi.mocked(sendEmail).mockRejectedValueOnce(new Error("mail rejected"));
  rpc.mockResolvedValueOnce({ data: true }).mockResolvedValueOnce({ data: true }).mockResolvedValueOnce({ data: false });
  for (const email of ["unknown@example.test", "delivery-failed@example.test", "too-soon@example.test"]) {
    const response = await post("request", { email });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  }
  expect(generateLink).toHaveBeenCalledTimes(2);
  expect(sendEmail).toHaveBeenCalledOnce();
});

it("does not consume a link for a weak password or update a user for a rejected token", async () => {
  expect((await post("complete", { tokenHash: token, password: "weak" })).status).toBe(400);
  expect(verifyOtp).not.toHaveBeenCalled();
  verifyOtp.mockResolvedValueOnce({ data: { session: null, user: null }, error: { status: 403, code: "otp_expired" } });
  const response = await post("complete", { tokenHash: token, password: "StrongerPass1!" });
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: { code: "RESET_LINK_INVALID" } });
  expect(updateUserById).not.toHaveBeenCalled();
});

it("limits password recovery requests even if callers rotate the authorization header", async () => {
  for (let i = 0; i < 5; i++) {
    expect((await post("request", { email: "invalid" }, `Bearer token-${i}`)).status).toBe(400);
  }
  expect((await post("request", { email: "invalid" }, "Bearer other")).status).toBe(429);
  expect(generateLink).not.toHaveBeenCalled();
});
