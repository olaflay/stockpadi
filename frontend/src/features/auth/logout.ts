import { getSupabase } from "@/lib/supabase";
import { clearSession } from "@/features/auth/session";
import { clearLocalBusinessId } from "@/lib/local-tenant";

/** Clears the local session so AuthProvider sends this device to normal login. */
export async function signOut(): Promise<void> {
  await clearSession();
  clearLocalBusinessId();
  const supabase = getSupabase();
  if (supabase && navigator.onLine) {
    await supabase.auth.signOut().catch(() => {});
  }
}
