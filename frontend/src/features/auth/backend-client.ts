import { getSupabase } from "@/lib/supabase";

export class BackendError extends Error {}

export async function callBackend<T>(functionName: string, body: unknown): Promise<T> {
  const supabase = getSupabase();
  if (!supabase) throw new BackendError("The app is not connected to Supabase.");
  const { data: { session } } = await supabase.auth.getSession();
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "");
  const backendPath = functionName === "platform-api" ? "/api/admin" : functionName === "account-context" ? "/api/account-context" : functionName === "register-business" ? "/api/businesses/register" : null;
  if (!backendUrl || !backendPath) throw new BackendError("The application backend is not configured.");
  const url = `${backendUrl}${backendPath}`;
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new BackendError(result?.error?.message ?? "The server rejected the request.");
  return result as T;
}
