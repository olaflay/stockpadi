"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Receipt,
  BarChart3,
  ClipboardCheck,
  MoreHorizontal,
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
  { label: "More", href: "/business/more", icon: MoreHorizontal },
] as const;

const WORKER_NAV = [
  { label: "Dashboard", href: "/work", icon: LayoutDashboard },
  { label: "Sell", href: "/work/pos", icon: Receipt },
  { label: "Products", href: "/work/products", icon: Package },
  { label: "Stock", href: "/work/stock-count", icon: ClipboardCheck },
  { label: "More", href: "/work/more", icon: MoreHorizontal },
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
        <main className="min-w-0 flex-1 flex flex-col overflow-x-hidden overflow-y-auto px-4 sm:px-6 pt-4 sm:pt-5 pb-32 w-full max-w-xl md:max-w-2xl mx-auto">
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
        <nav
          data-bottom-nav
          aria-label={`${shell} navigation`}
          className="fixed bottom-0 left-0 right-0 z-[var(--z-bottom-nav)] flex border-t border-border/40 bg-surface-container gpu-layer transition-transform duration-200"
          style={{
            paddingBottom: "max(0.65rem, calc(env(safe-area-inset-bottom, 0px) + 0.35rem))",
          }}
        >
          {/* Downward background extension: permanently blankets the chin and overscroll area behind the home indicator */}
          <div
            aria-hidden
            className="absolute top-full inset-x-0 h-32 bg-surface-container pointer-events-none"
          />
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (item.href !== "/business" && item.href !== "/work" && pathname.startsWith(`${item.href}/`)) ||
              (item.href === "/business/more" && (pathname === "/business/settings" || pathname.startsWith("/business/settings/")));
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                className={`min-w-0 flex min-h-[var(--touch-target-min)] flex-1 flex-col items-center justify-center gap-1 py-2 text-[length:var(--font-size-caption)] transition-colors duration-[var(--motion-duration-short)] ${
                  active ? "text-brand-accent-active font-semibold" : "text-on-surface-muted"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <span
                  className={`relative flex shrink-0 items-center justify-center rounded-full px-2 py-0.5 transition-colors duration-[var(--motion-duration-short)] sm:px-4 ${
                    active ? "bg-brand-accent/10" : ""
                  }`}
                >
                  <Icon size={22} strokeWidth={active ? 2.4 : 1.8} aria-hidden />
                  {(item.href === "/business" || item.href === "/work") && <AlertBadge />}
                </span>
                <span className="max-w-full min-w-0 truncate">{item.label}</span>
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
