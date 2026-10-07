import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateRequest = vi.hoisted(() => vi.fn());
const supabaseAdmin = vi.hoisted(() => vi.fn());

vi.mock("../../middleware/authenticate.js", () => ({ authenticateRequest }));
vi.mock("../../shared/supabase/client.js", () => ({ supabaseAdmin }));

import { HttpError } from "../../shared/errors/http-error.js";
import { handlePasswordUpdate } from "./password.controller.js";

describe("handlePasswordUpdate", () => {
  const updateUserById = vi.fn();

  beforeEach(() => {
    authenticateRequest.mockResolvedValue({ user: { id: "user-1" } });
    updateUserById.mockReset().mockResolvedValue({ error: null });
    supabaseAdmin.mockReturnValue({ auth: { admin: { updateUserById } } });
  });

  it("rejects a weak password before changing the account", async () => {
    await expect(handlePasswordUpdate(new Request("https://example.test"), { password: "password1!" })).rejects.toBeInstanceOf(HttpError);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("updates the authenticated account with a strong password without a business-context lookup", async () => {
    await expect(handlePasswordUpdate(new Request("https://example.test"), { password: "SecurePass1!" })).resolves.toEqual({ ok: true });
    expect(updateUserById).toHaveBeenCalledWith("user-1", { password: "SecurePass1!" });
  });
});
