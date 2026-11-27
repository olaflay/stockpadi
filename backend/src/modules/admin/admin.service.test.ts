import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeAdminOperation } from "./admin.service.js";
import { resolveAccountContext } from "../accounts/account-context.js";
import { getBusiness, sendBusinessApprovalEmail, setBusinessStatus, softDeleteBusiness, restoreBusiness } from "./admin.repository.js";

vi.mock("../accounts/account-context.js", () => ({ resolveAccountContext: vi.fn() }));
vi.mock("./admin.repository.js", () => ({
  listBusinesses: vi.fn(), getBusiness: vi.fn(), getSystemStats: vi.fn(), softDeleteBusiness: vi.fn(), restoreBusiness: vi.fn(),
  sendBusinessApprovalEmail: vi.fn(), setBusinessStatus: vi.fn(), writePlatformAudit: vi.fn(),
}));

describe("admin approval", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveAccountContext).mockResolvedValue({ accountType: "ADMIN" } as never);
  });

  it("sends the welcome only after approval commits", async () => {
    vi.mocked(sendBusinessApprovalEmail).mockResolvedValue(true);
    await expect(executeAdminOperation({} as never, { id: "admin" } as never, {
      action: "set_business_status", businessId: "business", status: "verified",
    })).resolves.toMatchObject({ status: "ok", welcomeEmailSent: true });
    expect(setBusinessStatus).toHaveBeenCalledWith({}, "admin", "business", "verified");
    expect(vi.mocked(setBusinessStatus).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(sendBusinessApprovalEmail).mock.invocationCallOrder[0],
    );
  });

  it("reports delivery failure without pretending approval failed", async () => {
    vi.mocked(sendBusinessApprovalEmail).mockResolvedValue(false);
    await expect(executeAdminOperation({} as never, { id: "admin" } as never, {
      action: "set_business_status", businessId: "business", status: "verified",
    })).resolves.toMatchObject({ status: "ok", welcomeEmailSent: false });
  });

  it("does not send a duplicate welcome email when an already-approved business is saved", async () => {
    vi.mocked(getBusiness).mockResolvedValue({ status: "verified", deleted_at: null } as never);
    await executeAdminOperation({} as never, { id: "admin" } as never, {
      action: "set_business_status", businessId: "business", status: "verified",
    });
    expect(sendBusinessApprovalEmail).not.toHaveBeenCalled();
  });

  it("never sends a welcome after a failed approval", async () => {
    vi.mocked(getBusiness).mockResolvedValue({ deleted_at: null } as never);
    vi.mocked(setBusinessStatus).mockRejectedValue(new Error("write failed"));
    await expect(executeAdminOperation({} as never, { id: "admin" } as never, {
      action: "set_business_status", businessId: "business", status: "verified",
    })).rejects.toThrow("write failed");
    expect(sendBusinessApprovalEmail).not.toHaveBeenCalled();
  });

  it("allows an approval email retry without changing business status", async () => {
    vi.mocked(getBusiness).mockResolvedValue({ status: "verified", is_active: true } as never);
    vi.mocked(sendBusinessApprovalEmail).mockResolvedValue(true);
    await expect(executeAdminOperation({} as never, { id: "admin" } as never, {
      action: "resend_approval_email", businessId: "business",
    })).resolves.toMatchObject({ welcomeEmailSent: true });
    expect(setBusinessStatus).not.toHaveBeenCalled();
    expect(sendBusinessApprovalEmail).toHaveBeenCalledExactlyOnceWith({}, "business");
  });

  it("blocks approval email retries for pending stores", async () => {
    vi.mocked(getBusiness).mockResolvedValue({ status: "pending", is_active: true } as never);
    await expect(executeAdminOperation({} as never, { id: "admin" } as never, {
      action: "resend_approval_email", businessId: "business",
    })).rejects.toMatchObject({ status: 409, code: "BUSINESS_NOT_APPROVED" });
    expect(sendBusinessApprovalEmail).not.toHaveBeenCalled();
  });

  it("rejects a non-admin before changing access or sending email", async () => {
    vi.mocked(resolveAccountContext).mockResolvedValue({ accountType: "BUSINESS_OWNER" } as never);
    await expect(executeAdminOperation({} as never, { id: "owner" } as never, {
      action: "set_business_status", businessId: "business", status: "verified",
    })).rejects.toMatchObject({ status: 403 });
    expect(setBusinessStatus).not.toHaveBeenCalled();
    expect(sendBusinessApprovalEmail).not.toHaveBeenCalled();
  });

  it("requires the exact business name before soft deletion and preserves business data", async () => {
    vi.mocked(getBusiness).mockResolvedValue({ name: "Corner Shop" } as never);
    await expect(executeAdminOperation({} as never, { id: "admin" } as never, {
      action: "soft_delete_business", businessId: "business", confirmation: "wrong name",
    })).rejects.toMatchObject({ status: 400, code: "CONFIRMATION_MISMATCH" });
    expect(softDeleteBusiness).not.toHaveBeenCalled();
    await executeAdminOperation({} as never, { id: "admin" } as never, {
      action: "soft_delete_business", businessId: "business", confirmation: "Corner Shop",
    });
    expect(softDeleteBusiness).toHaveBeenCalledWith({}, "admin", "business");
  });

  it("allows an authorized platform admin to restore a previously removed business", async () => {
    vi.mocked(getBusiness).mockResolvedValue({ name: "Corner Shop", deleted_at: "2026-01-01T00:00:00Z" } as never);
    await executeAdminOperation({} as never, { id: "admin" } as never, {
      action: "restore_business", businessId: "business",
    });
    expect(restoreBusiness).toHaveBeenCalledWith({}, "admin", "business");
  });

  it("prevents status changes that could leave a removed tenant in an ambiguous state", async () => {
    vi.mocked(getBusiness).mockResolvedValue({ deleted_at: "2026-01-01T00:00:00Z" } as never);
    await expect(executeAdminOperation({} as never, { id: "admin" } as never, {
      action: "set_business_status", businessId: "business", status: "verified",
    })).rejects.toMatchObject({ status: 409, code: "BUSINESS_REMOVED" });
    expect(setBusinessStatus).not.toHaveBeenCalled();
  });
});
