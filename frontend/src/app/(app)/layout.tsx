import { BannerStrip } from "@/components/ui/BannerStrip";
import { BottomNav } from "@/components/ui/BottomNav";
import { DrawerProvider } from "@/components/ui/DrawerContext";
import { TopStoreHeader } from "@/components/ui/TopStoreHeader";
import { SideDrawer } from "@/components/ui/SideDrawer";
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
        <DrawerProvider>
          <div className="flex h-dvh max-h-dvh w-full max-w-full flex-col overflow-hidden">
            <TopStoreHeader />
            <SyncEngine />
            <GuidedTour />
            <BannerStrip />
            <SideDrawer />
            <main className="flex-1 flex flex-col overflow-y-auto px-gutter sm:px-gutter-lg pt-4 sm:pt-5 pb-24 w-full max-w-lg mx-auto">{children}</main>
            <BottomNav />
          </div>
        </DrawerProvider>
      </LegacyShellGuard>
    </AuthProvider>
  );
}
