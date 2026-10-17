import { getSupabase } from "@/lib/supabase";
import { clearSession } from "@/features/auth/session";
import { clearFastPathAuthSession } from "@/features/auth/auth-session-sync";
import { clearLocalBusinessId } from "@/lib/local-tenant";

/** Clears the local session and theme override so any new user defaults to system theme. */
export async function signOut(): Promise<void> {
  await clearSession();
  clearFastPathAuthSession();
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
