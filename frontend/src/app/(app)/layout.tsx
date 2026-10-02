"use client";

import { BannerStrip } from "@/components/ui/BannerStrip";
import { BottomNav } from "@/components/ui/BottomNav";
import { DrawerProvider } from "@/components/ui/DrawerContext";
import { TopStoreHeader } from "@/components/ui/TopStoreHeader";
import { SideDrawer } from "@/components/ui/SideDrawer";
import { SyncEngine } from "@/features/sync/SyncEngine";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { GuidedTour } from "@/features/onboarding/components/GuidedTour";
import { LegacyShellGuard } from "@/features/shells/LegacyShellGuard";
import { KeyboardScrollHandler } from "@/components/ui/KeyboardScrollHandler";
import { NavigationProvider, useNavigation } from "@/components/ui/NavigationContext";

function AppShellBody({ children }: { children: React.ReactNode }) {
  const { isNavVisible } = useNavigation();

  return (
    <div className="flex h-dvh max-h-dvh w-full max-w-full flex-col overflow-hidden bg-surface">
      <TopStoreHeader />
      <SyncEngine />
      <GuidedTour />
      <BannerStrip />
      <SideDrawer />
      <main
        className={`flex-1 flex flex-col overflow-y-auto px-4 sm:px-6 pt-4 sm:pt-5 w-full max-w-xl md:max-w-2xl mx-auto transition-[padding] duration-200 ${
          isNavVisible ? "pb-24 sm:pb-28" : "pb-[max(1.25rem,env(safe-area-inset-bottom,1.25rem))]"
        }`}
      >
        {children}
      </main>
      {/* Global safe-area bottom blanket: guarantees every subpage, form, and detail screen blankets the curved chin */}
      <div
        aria-hidden
        className="fixed bottom-0 inset-x-0 pointer-events-none z-30 bg-surface"
        style={{
          height: "max(16px, env(safe-area-inset-bottom, 16px))",
        }}
      />
      {/* Deep overscroll blanket: guards against bounce/pull down to ensure zero black void */}
      <div
        aria-hidden
        className="fixed -bottom-32 inset-x-0 h-40 pointer-events-none z-20 bg-surface"
      />
      <BottomNav />
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <LegacyShellGuard>
        <DrawerProvider>
          <NavigationProvider>
            <KeyboardScrollHandler />
            <AppShellBody>{children}</AppShellBody>
          </NavigationProvider>
        </DrawerProvider>
      </LegacyShellGuard>
    </AuthProvider>
  );
}
