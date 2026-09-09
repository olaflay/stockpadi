"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  BarChart3,
  ClipboardCheck,
  UserCircle,
} from "lucide-react";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { BannerStrip } from "@/components/ui/BannerStrip";
import { SyncEngine } from "@/features/sync/SyncEngine";
import { DrawerProvider } from "@/components/ui/DrawerContext";
import { TopStoreHeader } from "@/components/ui/TopStoreHeader";
import { SideDrawer } from "@/components/ui/SideDrawer";
import { AlertBadge } from "@/components/ui/AlertBadge";

type Shell = "business" | "work";

/**
 * Standard 5-button bottom interaction area per Samsung One UI.
 * Exactly 5 buttons keep touch targets roomy and thumb-reachable on mobile.
 * All additional administrative/management tools are in the Google Drive-style
 * side drawer triggered from the top-left hamburger menu.
 */
const BUSINESS_NAV = [
  { label: "Dashboard", href: "/business", icon: LayoutDashboard },
  { label: "Sell", href: "/business/pos", icon: Receipt },
  { label: "Products", href: "/business/products", icon: Package },
  { label: "Reports", href: "/business/reports", icon: BarChart3 },
  { label: "Settings", href: "/business/settings", icon: Settings },
] as const;

const WORKER_NAV = [
  { label: "Dashboard", href: "/work", icon: LayoutDashboard },
  { label: "Sell", href: "/work/pos", icon: Receipt },
  { label: "Products", href: "/work/products", icon: Package },
  { label: "Stock", href: "/work/stock-count", icon: ClipboardCheck },
  { label: "Profile", href: "/work/profile", icon: UserCircle },
] as const;

function ShellContent({ shell, children }: { shell: Shell; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useCurrentUser();
  const accountType = user.accountType ?? "WORKER";
  const navItems = shell === "business" ? BUSINESS_NAV : WORKER_NAV;

  useEffect(() => {
    if (shell === "business" && accountType === "WORKER") router.replace("/work");
    if (shell === "work" && accountType === "BUSINESS_OWNER") router.replace("/business");
    if (shell === "work" && accountType === "ADMIN") router.replace("/admin");
  }, [accountType, router, shell]);

  return (
    <DrawerProvider>
      <div className="flex h-dvh max-h-dvh w-full max-w-full flex-col overflow-hidden bg-surface">
        <TopStoreHeader />
        <SyncEngine />
        <BannerStrip />
        <SideDrawer />
        <main className="flex-1 flex flex-col overflow-y-auto px-4 sm:px-6 pt-4 sm:pt-5 pb-32 w-full max-w-xl md:max-w-2xl mx-auto">
          {children}
        </main>
        <nav
          aria-label={`${shell} navigation`}
          className="fixed bottom-0 left-0 right-0 z-40 flex bg-surface/95 backdrop-blur-md gpu-layer after:content-[''] after:absolute after:top-full after:inset-x-0 after:h-8 after:bg-surface after:pointer-events-none"
          style={{
            paddingBottom: "max(0.25rem, env(safe-area-inset-bottom, 0.25rem))",
          }}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (item.href !== "/business" && item.href !== "/work" && pathname.startsWith(`${item.href}/`));
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                className={`flex min-h-[var(--touch-target-min)] flex-1 flex-col items-center justify-center gap-1 py-2 text-[length:var(--font-size-caption)] transition-colors duration-[var(--motion-duration-short)] ${
                  active ? "text-brand-accent-active font-semibold" : "text-on-surface-muted"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <span
                  className={`relative flex items-center justify-center rounded-full px-4 py-0.5 transition-colors duration-[var(--motion-duration-short)] ${
                    active ? "bg-brand-accent/10" : ""
                  }`}
                >
                  <Icon size={22} strokeWidth={active ? 2.4 : 1.8} aria-hidden />
                  {(item.href === "/business" || item.href === "/work") && <AlertBadge />}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </DrawerProvider>
  );
}

export function ExperienceShell({ shell, children }: { shell: Shell; children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ShellContent shell={shell}>{children}</ShellContent>
    </AuthProvider>
  );
}
