import { getSupabase } from "@/lib/supabase";
import { clearSession } from "@/features/auth/session";

/** Clears the local session so AuthProvider sends this device to /unlock next render. */
export async function signOut(): Promise<void> {
  await clearSession();
  const supabase = getSupabase();
  if (supabase && navigator.onLine) {
    await supabase.auth.signOut().catch(() => {});
  }
}
