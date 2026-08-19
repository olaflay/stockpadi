import { getSupabase } from "@/lib/supabase";

async function get<T>(path: string): Promise<T> {
  const supabase = getSupabase();
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "");
  const { data: { session } } = await supabase!.auth.getSession();
  if (!session || !backendUrl) throw new Error("The application backend is not configured.");
  const response = await fetch(`${backendUrl}${path}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message ?? "Could not load inventory.");
  return result as T;
}

export interface ServerProduct { id: string; name: string; sku: string; barcode: string | null; sell_price: number; low_stock_threshold: number | null; }
export interface ServerStock { product_id: string; branch_id: string; quantity: number; }
export const fetchServerProducts = () => get<{ products: ServerProduct[] }>("/api/products");
export const fetchServerInventory = () => get<{ stock: ServerStock[]; branchIds: string[] }>("/api/inventory");
