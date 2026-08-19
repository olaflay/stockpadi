import { getSupabase } from "@/lib/supabase";

async function get<T>(path: string): Promise<T> {
  const supabase = getSupabase();
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "");
  const { data: { session } } = await supabase!.auth.getSession();
  if (!session || !backendUrl) throw new Error("The application backend is not configured.");
  const response = await fetch(`${backendUrl}${path}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message ?? "Could not load customers.");
  return result as T;
}

export interface ServerCustomer { id: string; name: string; phone: string | null; updated_at: string; balance: number; }
export const fetchServerCustomers = () => get<{ customers: ServerCustomer[] }>("/api/customers");
export const fetchServerCustomer = (id: string) => get<{ customer: ServerCustomer; creditMovements: unknown[]; sales: unknown[] }>(`/api/customers/${encodeURIComponent(id)}`);
