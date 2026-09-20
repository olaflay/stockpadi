import { BackendRequestError, NetworkUnavailableError, serverPost } from "@/features/operations/server-client";

export async function sendVerificationEmail(): Promise<{ ok: boolean; message?: string }> {
  try { await serverPost("/api/auth/email-verification/send", {}); return { ok: true }; }
  catch (error) { return { ok: false, message: error instanceof BackendRequestError || error instanceof NetworkUnavailableError ? error.message : "Could not send the verification email." }; }
}

export async function verifyEmailCode(code: string): Promise<{ ok: boolean; message?: string }> {
  try { await serverPost("/api/auth/email-verification/verify", { code }); return { ok: true }; }
  catch (error) { return { ok: false, message: error instanceof BackendRequestError || error instanceof NetworkUnavailableError ? error.message : "That code did not work." }; }
}
