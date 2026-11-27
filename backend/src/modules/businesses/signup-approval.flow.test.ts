import { afterEach, expect, it, vi } from "vitest";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import { verifyEmailCode } from "../auth/email-verification.service.js";
import { executeAdminOperation } from "../admin/admin.service.js";
import { registerBusiness } from "./business.service.js";

vi.mock("../../shared/supabase/client.js", () => ({ supabaseAdmin: vi.fn() }));
vi.mock("../accounts/account-context.js", () => ({
  resolveAccountContext: vi.fn(async () => ({ accountType: "ADMIN" })),
}));
vi.mock("../sync/sync-hints.js", () => ({ queueSyncHints: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("sends the owner only an OTP at signup, the administrator a review email, and the owner a login link after approval", async () => {
  const owner = { id: "owner", email: "owner@example.test" };
  const businessId = "9ace0000-1234-1234-1234-123456789abc";
  const business = { id: businessId, status: "pending", is_active: true, name: "Corner Shop" };
  const profile = { id: owner.id, full_name: "Test Owner", account_type: "BUSINESS_OWNER", email_verified: false };
  const audit = vi.fn(async () => ({ error: null }));
  const createUser = vi.fn(async () => ({ data: { user: owner }, error: null }));
  const db = {
    auth: { admin: { createUser, getUserById: async () => ({ data: { user: owner }, error: null }) } },
    rpc: vi.fn(async (name: string, args: { p_status?: string }) => {
      if (name === "platform_set_business_status" && args.p_status) business.status = args.p_status;
      return { error: null };
    }),
    from(table: string) {
      const data = {
        users: profile,
        business_profile: business,
        business_memberships: { business_id: businessId },
        branches: { id: "branch", name: "Main branch", is_active: true },
      }[table];
      const query = {
        select: () => query,
        eq: () => query,
        limit: () => query,
        maybeSingle: async () => ({ data, error: null }),
        update: (changes: object) => ({ eq: async () => { Object.assign(profile, changes); return { error: null }; } }),
        insert: audit,
      };
      return query;
    },
  };
  vi.mocked(supabaseAdmin).mockReturnValue(db as never);
  vi.stubEnv("BREVO_API_KEY", "fake-key");
  vi.stubEnv("ADMIN_EMAIL", "admin@example.test");
  vi.stubEnv("FRONTEND_ORIGIN", "https://app.example.test");
  const messages: { to: { email: string }[]; subject: string; textContent: string; htmlContent: string }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    messages.push(JSON.parse(String(init.body)));
    return Response.json({ messageId: "test-message" });
  }));

  await expect(registerBusiness({
    email: owner.email, password: "StrongValue!52", fullName: profile.full_name,
    businessName: business.name, businessTypeId: "general_retail",
  })).resolves.toMatchObject({ accountState: "REGISTERED_UNVERIFIED", verificationEmailSent: true, adminNotificationSent: true });
  expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ email: owner.email, email_confirm: true }));
  expect(messages.map(message => message.to)).toEqual([[{ email: owner.email }], [{ email: "admin@example.test" }]]);
  const code = messages[0].textContent.match(/^\d{6}$/m)?.[0];
  expect(code).toBeDefined();
  expect(messages[1].htmlContent).toContain(`https://app.example.test/admin/businesses/${businessId}`);
  expect(messages[1].htmlContent).not.toContain(`>${code}</p>`);

  await expect(verifyEmailCode(db as never, owner as never, code!)).resolves.toMatchObject({ status: "verified" });
  expect(messages).toHaveLength(2);
  expect(profile.email_verified).toBe(true);
  expect(business.status).toBe("pending");

  const approval = { action: "set_business_status", businessId, status: "verified" } as const;
  await expect(executeAdminOperation(db as never, { id: "admin" } as never, approval)).resolves.toMatchObject({ welcomeEmailSent: true });
  expect(business.status).toBe("verified");
  expect(messages).toHaveLength(3);
  expect(messages[2].to).toEqual([{ email: owner.email }]);
  expect(messages[2].subject).toMatch(/approved/i);
  expect(messages[2].htmlContent).toContain('href="https://app.example.test/login"');

  await executeAdminOperation(db as never, { id: "admin" } as never, approval);
  expect(messages).toHaveLength(3);
});
