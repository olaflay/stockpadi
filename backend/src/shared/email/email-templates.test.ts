import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderNewSignupAdminEmail, renderVerificationEmail, renderWelcomeEmail, renderWorkerInviteEmail, renderWorkerPasswordChangedEmail } from "./email-templates.js";

afterEach(() => vi.unstubAllEnvs());

describe("transactional emails", () => {
  it("uses one minimal layout, configured branding and escaped customer input", () => {
    vi.stubEnv("BUSINESS_DISPLAY_NAME", "Example & Retail");
    vi.stubEnv("FRONTEND_ORIGIN", "https://app.example.test");
    const emails = [
      renderVerificationEmail("<script>owner</script>", "123456"),
      renderWelcomeEmail("<script>owner</script>", "<Store>"),
      renderWorkerInviteEmail("<script>owner</script>", "staff@example.test"),
      renderWorkerPasswordChangedEmail("staff@example.test"),
      renderNewSignupAdminEmail({ ownerName: "<script>owner</script>", ownerEmail: "owner@example.test", storeName: "<Store>", businessType: "retail", businessId: "id" }),
    ];
    for (const email of emails) {
      expect(email.html).toContain('class="email-content"');
      expect(email.html).toContain("Example &amp; Retail");
      expect(email.html).not.toContain("<script>");
      expect(email.html).not.toContain("box-shadow");
      expect(email.html).not.toContain("user-scalable=no");
      expect(email.html).toContain('aria-hidden="true" class="document-motif"');
      expect(email.html).not.toMatch(/<(img|svg)\b/);
      expect(email.text).not.toContain("document-motif");
      expect(email.text).toBeTruthy();
    }
    expect(emails[1].text).toContain("has been approved");
    expect(emails[0].html).toContain(">123456</p>");
    expect(emails[0].html).not.toContain("href=");
    expect(emails[1].html).toContain('href="https://app.example.test/login"');
    expect(emails[1].text).toContain("https://app.example.test/login");
    expect(emails[4].html).toContain('href="https://app.example.test/admin/businesses/id"');
    expect(emails[4].text).toContain("https://app.example.test/admin/businesses/id");
  });

  it("requires an HTTPS origin for the approval link in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FRONTEND_ORIGIN", "http://app.example.test");
    expect(() => renderWelcomeEmail("Owner", "Store")).toThrow("HTTPS frontend URL");
    expect(renderVerificationEmail("Owner", "012345").text).toContain("012345");
  });

  it("keeps the compatibility-runtime verification and welcome templates identical", () => {
    const node = readFileSync(new URL("./email-templates.ts", import.meta.url), "utf8");
    const deno = readFileSync(new URL("../../../../supabase/functions/_shared/email-templates.ts", import.meta.url), "utf8");
    const shared = node.slice(0, node.indexOf("/** Platform-admin notification"))
      .replace(/process\.env\.([A-Z_]+)/g, 'Deno.env.get("$1")').trim();
    expect(deno.trim()).toBe(shared);
  });
});
