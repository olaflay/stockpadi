"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, Radio, Server, LogOut, ShieldCheck } from "lucide-react";
import { signOut } from "@/features/auth/logout";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { RippleButton } from "@/components/ui/Ripple";

interface AdminShellProps {
  children: React.ReactNode;
}

export function AdminShell({ children }: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const currentUser = useCurrentUser();

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  const isBusinessesActive = pathname === "/admin" || pathname.startsWith("/admin/businesses");
  const isBroadcastsActive = pathname.startsWith("/admin/broadcasts");
  const isSettingsActive = pathname.startsWith("/admin/settings");

  return (
    <div className="min-h-screen w-full bg-surface text-on-surface flex flex-col selection:bg-brand-accent/20">
      {/* Platform Executive Header */}
      <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-surface/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 sm:px-6 py-3.5">
          {/* Brand & Context */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-accent/15 text-brand-accent border border-brand-accent/30 shadow-xs">
              <ShieldCheck size={22} className="text-brand-accent" aria-hidden />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight text-on-surface">StockPadi</span>
                <span className="rounded-md bg-brand-accent/10 px-2 py-0.5 text-[11px] font-semibold text-brand-accent border border-brand-accent/20">
                  Super Admin
                </span>
              </div>
              <p className="flex items-center gap-1.5 text-[11px] text-on-surface-muted">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                <span>Multi-Tenant Cluster</span>
              </p>
            </div>
          </div>

          {/* User Info & Actions */}
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden sm:flex flex-col items-end text-right">
              <span className="text-xs font-semibold text-on-surface">Platform Operator</span>
              <span className="text-[11px] text-on-surface-muted font-mono truncate max-w-[150px]">
                {currentUser.accountType === "ADMIN" ? "super_admin" : "admin"}
              </span>
            </div>

            <RippleButton
              type="button"
              onClick={handleSignOut}
              className="flex h-9 items-center gap-1.5 rounded-[var(--radius-control)] border border-danger/30 bg-danger/5 px-3 text-xs font-semibold text-danger hover:bg-danger/10 active:scale-95 transition-all cursor-pointer"
              title="Sign Out of Platform Admin"
            >
              <LogOut size={14} aria-hidden />
              <span className="hidden sm:inline">Exit</span>
            </RippleButton>
          </div>
        </div>

        {/* Executive Navigation Tabs */}
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <nav className="flex items-center gap-2 overflow-x-auto py-2 no-scrollbar" aria-label="Super Admin Tabs">
            <Link
              href="/admin"
              className={`min-h-[38px] inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs sm:text-sm font-semibold transition-all ${
                isBusinessesActive
                  ? "bg-brand-accent text-brand-accent-contrast shadow-sm"
                  : "text-on-surface-muted hover:text-on-surface hover:bg-surface-container-high/60"
              }`}
            >
              <Building2 size={16} aria-hidden />
              <span>Tenants</span>
            </Link>

            <Link
              href="/admin/broadcasts"
              className={`min-h-[38px] inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs sm:text-sm font-semibold transition-all ${
                isBroadcastsActive
                  ? "bg-brand-accent text-brand-accent-contrast shadow-sm"
                  : "text-on-surface-muted hover:text-on-surface hover:bg-surface-container-high/60"
              }`}
            >
              <Radio size={16} aria-hidden />
              <span>Broadcasts</span>
            </Link>

            <Link
              href="/admin/settings"
              className={`min-h-[38px] inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs sm:text-sm font-semibold transition-all ${
                isSettingsActive
                  ? "bg-brand-accent text-brand-accent-contrast shadow-sm"
                  : "text-on-surface-muted hover:text-on-surface hover:bg-surface-container-high/60"
              }`}
            >
              <Server size={16} aria-hidden />
              <span>Platform Health</span>
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>
    </div>
  );
}
