"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Package, Receipt, Users, Settings, BarChart3, ClipboardCheck, MoreHorizontal, Bell, UserCircle, CalendarCheck } from "lucide-react";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import { InstallBanner } from "@/components/ui/InstallBanner";
import { NotificationBanner } from "@/components/ui/NotificationBanner";
import { SyncEngine } from "@/features/sync/SyncEngine";

import { AlertBadge } from "@/components/ui/AlertBadge";

type Shell = "business" | "work";

const BUSINESS_NAV = [
  { label: "Dashboard", href: "/business", icon: LayoutDashboard },
  { label: "Sell", href: "/business/pos", icon: Receipt },
  { label: "Products", href: "/business/products", icon: Package },
  { label: "Sales", href: "/business/sales", icon: BarChart3 },
  { label: "Staff", href: "/business/staff", icon: Users },
  { label: "Settings", href: "/business/settings", icon: Settings },
] as const;

const WORKER_NAV = [
  { label: "Sell", href: "/work/pos", icon: Receipt },
  { label: "Sales", href: "/work/sales", icon: BarChart3 },
  { label: "Products", href: "/work/products", icon: Package },
  { label: "Stock", href: "/work/stock-count", icon: ClipboardCheck },
  { label: "Customers", href: "/work/customers", icon: Users },
] as const;

const WORKER_MORE = [
  { label: "Products", href: "/work/products", icon: Package },
  { label: "Customers", href: "/work/customers", icon: Users },
  { label: "Inventory", href: "/work/inventory", icon: ClipboardCheck },
  { label: "Stock count", href: "/work/stock-count", icon: ClipboardCheck },
  { label: "Close day", href: "/work/close-day", icon: CalendarCheck },
  { label: "Alerts", href: "/work/alerts", icon: Bell },
  { label: "Profile", href: "/work/profile", icon: UserCircle },
] as const;

function ShellContent({ shell, children }: { shell: Shell; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const user = useCurrentUser();
  const accountType = user.accountType ?? "WORKER";
  const visibleItems = shell === "business" ? BUSINESS_NAV : WORKER_NAV;

  useEffect(() => {
    if (shell === "business" && accountType === "WORKER") router.replace("/work");
    if (shell === "work" && accountType === "BUSINESS_OWNER") router.replace("/business");
    if (shell === "work" && accountType === "ADMIN") router.replace("/admin");
  }, [accountType, router, shell]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <SyncEngine />
      <OfflineBanner />
      <InstallBanner />
      <NotificationBanner />
      <main className="flex-1 overflow-y-auto px-5 pt-4 pb-24">{children}</main>
      <nav aria-label={`${shell} navigation`} className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
        <Link href={shell === "business" ? "/business" : "/work"} className="flex min-h-[var(--touch-target-min)] flex-1 flex-col items-center justify-center gap-1 py-2 text-[length:var(--font-size-caption)] text-on-surface-muted">
          <span className="relative flex items-center justify-center">
            <LayoutDashboard size={22} aria-hidden />
            <AlertBadge />
          </span>
          Home
        </Link>
        {visibleItems.slice(1, 5).map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link key={item.href} href={item.href} className={`flex min-h-[var(--touch-target-min)] flex-1 flex-col items-center justify-center gap-1 py-2 text-[length:var(--font-size-caption)] ${active ? "font-semibold text-brand-accent-active" : "text-on-surface-muted"}`} aria-current={active ? "page" : undefined}>
              <Icon size={22} aria-hidden />
              {item.label}
            </Link>
          );
        })}
        {shell === "work" && <button type="button" onClick={() => setMoreOpen((open) => !open)} className="flex min-h-[var(--touch-target-min)] flex-1 flex-col items-center justify-center gap-1 py-2 text-[length:var(--font-size-caption)] text-on-surface-muted" aria-expanded={moreOpen}><MoreHorizontal size={22} aria-hidden />More</button>}
      </nav>
      {shell === "work" && moreOpen && <div className="fixed bottom-16 right-3 z-50 w-56 rounded-[var(--radius-card)] border border-border bg-surface p-2 shadow-[var(--shadow-elevation-3)]" role="menu">{WORKER_MORE.map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} onClick={() => setMoreOpen(false)} className="flex min-h-[var(--touch-target-min)] items-center gap-3 rounded-[var(--radius-control)] px-3 text-[length:var(--font-size-body)] text-on-surface hover:bg-surface-container" role="menuitem"><Icon size={18} aria-hidden />{item.label}</Link>; })}</div>}
    </div>
  );
}

export function ExperienceShell({ shell, children }: { shell: Shell; children: React.ReactNode }) {
  return <AuthProvider><ShellContent shell={shell}>{children}</ShellContent></AuthProvider>;
}
