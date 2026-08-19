import { getSupabase } from "@/lib/supabase";

export class NetworkUnavailableError extends Error {
  readonly code = "NETWORK_UNAVAILABLE";
  constructor(message = "The backend could not be reached.") { super(message); }
}

export class BackendRequestError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

class BackendConfigurationError extends Error {
  readonly code = "BACKEND_CONFIGURATION";
}

export async function serverGet<T>(path: string): Promise<T> {
  const supabase = getSupabase();
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "");
  const { data: { session } } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  if (!session || !backendUrl) throw new BackendConfigurationError("The application backend is not configured.");
  let response: Response;
  try { response = await fetch(`${backendUrl}${path}`, { headers: { Authorization: `Bearer ${session.access_token}` } }); }
  catch { throw new NetworkUnavailableError(); }
  const result = await response.json();
  if (!response.ok) throw new BackendRequestError(response.status, result?.error?.code ?? "BACKEND_REJECTED", result?.error?.message ?? "The server rejected the request.");
  return result as T;
}

export async function serverPost<T>(path: string, body: unknown): Promise<T> {
  const supabase = getSupabase();
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "");
  const { data: { session } } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  if (!session || !backendUrl) throw new BackendConfigurationError("The application backend is not configured.");
  let response: Response;
  try { response = await fetch(`${backendUrl}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) }); }
  catch { throw new NetworkUnavailableError(); }
  const result = await response.json();
  if (!response.ok) throw new BackendRequestError(response.status, result?.error?.code ?? "BACKEND_REJECTED", result?.error?.message ?? "The server rejected the request.");
  return result as T;
}
