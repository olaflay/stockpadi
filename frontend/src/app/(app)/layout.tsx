import { BannerStrip } from "@/components/ui/BannerStrip";
import { BottomNav } from "@/components/ui/BottomNav";
import { SyncEngine } from "@/features/sync/SyncEngine";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { GuidedTour } from "@/features/onboarding/components/GuidedTour";
import { LegacyShellGuard } from "@/features/shells/LegacyShellGuard";

/**
 * The authenticated app shell: top viewing area (offline banner, screen
 * content) over a fixed bottom interaction area (nav), per One UI. See
 * .agents/rules/design-system.md. AuthProvider gates everything below it on
 * a valid cached session — see docs/RESEARCH-AND-PLAN.md Phase 2 item 14.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <LegacyShellGuard>
        <div className="flex h-screen w-full max-w-full flex-col overflow-hidden">
          <SyncEngine />
          <GuidedTour />
          <BannerStrip />
          <main className="flex-1 overflow-y-auto px-5 pt-4 pb-24">{children}</main>
          <BottomNav />
        </div>
      </LegacyShellGuard>
    </AuthProvider>
  );
}
