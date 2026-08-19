import { getSupabase } from "@/lib/supabase";

async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function sendVerificationEmail(): Promise<{ ok: boolean; message?: string }> {
  const token = await getAccessToken();
  if (!token) return { ok: false, message: "Session expired. Refresh and try again." };
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "");
  if (!backendUrl) return { ok: false, message: "The application backend is not configured." };
  const response = await fetch(`${backendUrl}/api/auth/email-verification/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok) return { ok: false, message: result?.error?.message ?? "Could not send the verification email." };
  return { ok: true };
}

export async function verifyEmailCode(code: string): Promise<{ ok: boolean; message?: string }> {
  const token = await getAccessToken();
  if (!token) return { ok: false, message: "Session expired. Refresh and try again." };
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "");
  if (!backendUrl) return { ok: false, message: "The application backend is not configured." };
  const response = await fetch(`${backendUrl}/api/auth/email-verification/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ code }),
  });
  const result = await response.json();
  if (!response.ok) return { ok: false, message: result?.error?.message ?? "That code did not work." };
  return { ok: true };
}
