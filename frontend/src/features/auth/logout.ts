import { getSupabase } from "@/lib/supabase";
import { clearSession } from "@/features/auth/session";
import { clearLocalBusinessId } from "@/lib/local-tenant";

/** Clears the local session and theme override so any new user defaults to system theme. */
export async function signOut(): Promise<void> {
  await clearSession();
  clearLocalBusinessId();
  if (typeof window !== "undefined") {
    window.localStorage.removeItem("stockpadi-theme");
    document.documentElement.removeAttribute("data-theme");
  }
  const supabase = getSupabase();
  if (supabase && navigator.onLine) {
    await supabase.auth.signOut().catch(() => {});
  }
}
