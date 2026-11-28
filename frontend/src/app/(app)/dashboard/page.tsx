"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Store,
  Wallet,
  PackagePlus,
  Plus,
  CalendarCheck,
  Receipt,
  Package,
  Users,
  AlertTriangle,
  ClipboardCheck,
  ArrowRight,
} from "lucide-react";
import { db } from "@/lib/db";
import { tenantArray, tenantGet } from "@/lib/local-tenant";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { formatCurrency } from "@/lib/format";
import { DashboardSalesCard } from "@/features/dashboard/DashboardSalesCard";
import { useDashboardMetrics } from "@/features/dashboard/use-dashboard-metrics";
import { getAllCustomerCreditBalances } from "@/features/customers/credit";
import { SelectInput } from "@/components/ui/SelectInput";
import { RippleButton } from "@/components/ui/Ripple";
import { RippleLink } from "@/components/ui/Ripple";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { hasCapability } from "@/features/auth/authorization";
import { EmailVerificationBanner } from "@/features/auth/EmailVerificationBanner";
import { AddExpenseSheet } from "@/features/expenses/components/AddExpenseSheet";

/**
 * One KPI tile: label up top, big number + caption below, and optional actionable prompt.
 * Pure typography and tonal surface matching Samsung One UI / M3 design tokens.
 */
function KpiCard({
  label,
  value,
  sub,
  actionLabel,
  icon: Icon,
  iconTone = "bg-brand-container text-on-brand-container",
  valueClassName = "text-on-surface",
  href,
  onClick,
}: {
  label: string;
  value: string;
  sub: string;
  actionLabel?: string;
  icon: typeof Receipt;
  iconTone?: string;
  valueClassName?: string;
  href?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
    <div className="flex min-w-0 items-start gap-2">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10 ${iconTone}`}>
        <Icon size={17} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold leading-tight text-on-surface">{label}</p>
        <p className={`mt-1 wrap-anywhere font-number text-[clamp(15px,4.2vw,18px)] font-bold leading-snug tracking-tight tabular-nums ${valueClassName}`}>
          {value}
        </p>
        <p className="mt-0.5 text-xs leading-tight text-on-surface-muted">{sub}</p>
      </div>
    </div>
    {actionLabel && (
      <span className="mt-auto flex w-full items-center justify-between gap-1 pt-2 text-[length:var(--font-size-caption)] font-semibold text-brand-accent-active">
        {actionLabel}<ArrowRight size={14} className="shrink-0" aria-hidden />
      </span>
    )}
    </>
  );

  const className = "flex min-h-[var(--touch-target-min)] min-w-0 flex-col rounded-2xl bg-surface-container p-3 text-left shadow-elevation-1 sm:p-4 hover:bg-surface-container-high transition-colors";

  if (href) {
    return (
      <RippleLink href={href} className={className}>
        {content}
      </RippleLink>
    );
  }

  return (
    <RippleButton type="button" onClick={onClick} className={className}>
      {content}
    </RippleButton>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const [branchId, setBranchId] = useState<string | null>(null);
  const [isExpenseSheetOpen, setIsExpenseSheetOpen] = useState(false);
  const branches = useLiveQuery(() => tenantArray(db.branches), [], []);
  
  // Scoped permissions:
  // - Cashiers/workers with VIEW_OWN_SALES see their own sales total for the day
  // - Full store finances (net cash flow, inventory valuation) are owner/admin only
  // - Customer credit is visible to users with VIEW_CUSTOMERS
  const canSeeStoreMoney = user.accountType !== "WORKER";
  const canSeeOwnSales = hasCapability(user, "VIEW_OWN_SALES");
  const canSeeCustomers = hasCapability(user, "VIEW_CUSTOMERS");
  const viewerId = user.accountType === "WORKER" ? user.id : null;
  const metrics = useDashboardMetrics(branchId, viewerId);

  const quickActions = [
    hasCapability(user, "POS_SELL") && {
      key: "sell",
      label: "Sell",
      href: "/pos",
      icon: Receipt,
      isPrimary: true,
    },
    hasCapability(user, "MANAGE_PRODUCTS") && {
      key: "add-product",
      label: "New item",
      href: "/products/new",
      icon: Plus,
    },
    hasCapability(user, "RECEIVE_STOCK") && {
      key: "restock",
      label: "Restock",
      href: "/purchases/new",
      icon: PackagePlus,
    },
    hasCapability(user, "MANAGE_EXPENSES") && {
      key: "expense",
      label: "Expense",
      onClick: () => setIsExpenseSheetOpen(true),
      icon: Wallet,
    },
    hasCapability(user, "SUBMIT_STOCK_COUNT") && !hasCapability(user, "MANAGE_PRODUCTS") && {
      key: "stock-count",
      label: "Audit",
      href: "/stock-count",
      icon: ClipboardCheck,
    },
  ].filter(Boolean) as Array<{
    key: string;
    label: string;
    icon: typeof Receipt;
    href?: string;
    onClick?: () => void;
    isPrimary?: boolean;
  }>;

  // Live debtor balances and count
  const customersOwingData = useLiveQuery(async () => {
    if (!canSeeCustomers) return { totalOwed: 0, debtorCount: 0 };
    const balances = await getAllCustomerCreditBalances();
    let total = 0;
    let count = 0;
    for (const b of balances.values()) {
      if (b > 0) {
        total += b;
        count++;
      }
    }
    return { totalOwed: total, debtorCount: count };
  }, [canSeeCustomers], { totalOwed: 0, debtorCount: 0 });

  // Live query for email verification status
  const localUser = useLiveQuery(() => tenantGet<import("@/lib/db").LocalUser>(db.localUsers, user.id), [user.id]);
  const showVerificationBanner =
    user.accountType === "BUSINESS_OWNER" && localUser !== undefined && !localUser?.emailVerified;
    
  const netCashFlow = metrics
    ? (metrics.todaysCashSalesTotal - metrics.todaysExpensesTotal - metrics.todaysPurchasesTotal + metrics.todaysCreditCollected)
    : 0;

  if (metrics === undefined) {
    const isWorker = user.accountType === "WORKER";
    const expectedKpiCount = isWorker ? (canSeeCustomers ? 2 : 1) : 4;
    return (
      <div className="flex flex-col gap-3 pb-6 sm:pb-8">
        <ScreenHeader title="Dashboard" hideBack={true} />

        {/* Hero Focus Card Placeholder */}
        <div className="rounded-3xl p-4 sm:p-5 flex flex-col justify-between h-32 sm:h-34 bg-surface-container/60 shadow-xs">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-28 rounded" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-8 w-44 rounded-lg my-1" />
          <div className="flex items-center justify-between">
            <Skeleton className="h-3.5 w-24 rounded" />
            <Skeleton className="h-3.5 w-18 rounded" />
          </div>
        </div>

        {/* Quick Actions Dock Placeholder */}
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 sm:h-18 rounded-2xl" />
          ))}
        </div>

        {/* 2x2 KPI Grid Placeholder */}
        <div className={`grid gap-2.5 sm:gap-3 ${expectedKpiCount === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
          {Array.from({ length: expectedKpiCount }).map((_, i) => (
            <div
              key={i}
              className="h-24 sm:h-26 rounded-2xl p-3 bg-surface-container/60 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <Skeleton className="h-3.5 w-16 rounded" />
                <Skeleton className="h-3.5 w-3.5 rounded-full" />
              </div>
              <Skeleton className="h-6 w-24 rounded-md" />
              <Skeleton className="h-3 w-14 rounded" />
            </div>
          ))}
        </div>

        {/* Recent Activity Rows filling down the screen */}
        <div className="rounded-2xl p-3 bg-surface-container/60 flex flex-col gap-2.5 mt-1">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3.5 w-28 rounded" />
            <Skeleton className="h-3.5 w-12 rounded" />
          </div>
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (metrics.error) {
    return (
      <div>
        <ScreenHeader title="Dashboard" hideBack={true} />
        <ErrorState
          message="Couldn't load your dashboard data from this device."
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  if (!metrics.hasAnyProducts) {
    return (
      <div className="flex flex-col flex-1 h-full min-h-0 justify-between">
        <ScreenHeader title="Dashboard" hideBack={true} />
        <EmptyState
          icon={Store}
          title="Let's get your shop set up"
          description="Add your first product and this screen fills in with your sales and stock numbers."
          action={{
            label: "Add a product",
            onClick: () => router.push(hasCapability(user, "MANAGE_PRODUCTS") ? "/products/new" : "/products"),
          }}
        />
      </div>
    );
  }

  return (
    <div className="financial-surfaces pb-6 sm:pb-8">
      <ScreenHeader title="Dashboard" hideBack={true} />

      {/* Email verification banner — shown only to owner until email confirmed */}
      {showVerificationBanner && (
        <div className="mb-4">
          <EmailVerificationBanner userId={user.id} />
        </div>
      )}

      {/* Branch selector if multi-branch */}
      {branches && branches.length > 1 && (
        <div className="mb-4">
          <SelectInput
            value={branchId ?? "all"}
            onChange={(event) => setBranchId(event.target.value === "all" ? null : event.target.value)}
          >
            <option value="all">All branches (consolidated)</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </SelectInput>
        </div>
      )}

      {canSeeOwnSales && (
        <DashboardSalesCard branchId={branchId} viewerId={viewerId} branchIds={user.branchIds} />
      )}

      {/* QUICK ACTIONS DOCK: Anchored directly below hero in the primary thumb arc */}
      {quickActions.length > 0 && (
        <section aria-labelledby="dashboard-actions-title" className="mb-4">
          <h2 id="dashboard-actions-title" className="mb-2 text-lg font-bold text-on-surface">Quick actions</h2>
        <div
          className={`grid gap-2 sm:gap-3 ${
            quickActions.length === 2
              ? "grid-cols-2"
              : quickActions.length === 3
              ? "grid-cols-3"
              : "grid-cols-4"
          }`}
        >
          {quickActions.map((action) => {
            const Icon = action.icon;
            if ("href" in action && action.href) {
              return (
                <RippleLink
                  key={action.key}
                  href={action.href}
                  className="group flex flex-col items-center justify-center rounded-2xl bg-surface-container px-1 py-2.5 text-center shadow-elevation-1 min-w-0 active:scale-95 transition-transform"
                >
                  <div
                    className={`flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-2xl shadow-xs transition-all ${
                      action.isPrimary
                        ? "bg-brand-accent text-brand-accent-contrast shadow-sm group-hover:brightness-105"
                        : "bg-surface-container-highest text-brand-accent group-hover:bg-brand-container/40 group-hover:text-brand-accent"
                    }`}
                  >
                    <Icon size={22} strokeWidth={2.4} aria-hidden />
                  </div>
                  <span className={`mt-2 text-xs sm:text-[13px] text-on-surface group-hover:text-brand-accent text-center leading-tight truncate w-full transition-colors ${action.isPrimary ? "font-semibold" : "font-medium"}`}>
                    {action.label}
                  </span>
                </RippleLink>
              );
            }
            return (
              <RippleButton
                key={action.key}
                type="button"
                onClick={action.onClick}
                className="group flex flex-col items-center justify-center rounded-2xl bg-surface-container px-1 py-2.5 text-center shadow-elevation-1 min-w-0 active:scale-95 transition-transform"
              >
                <div
                  className={`flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-2xl shadow-xs transition-all ${
                    action.isPrimary
                      ? "bg-brand-accent text-brand-accent-contrast shadow-sm group-hover:brightness-105"
                      : "bg-surface-container-highest text-brand-accent group-hover:bg-brand-container/40 group-hover:text-brand-accent"
                  }`}
                >
                  <Icon size={22} strokeWidth={2.4} aria-hidden />
                </div>
                <span className={`mt-2 text-xs sm:text-[13px] text-on-surface group-hover:text-brand-accent text-center leading-tight truncate w-full transition-colors ${action.isPrimary ? "font-semibold" : "font-medium"}`}>
                  {action.label}
                </span>
              </RippleButton>
            );
          })}
        </div>
        </section>
      )}

      {/* SECONDARY METRICS: 2x2 Grid */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        {canSeeStoreMoney && (
          <KpiCard
            label="Net cash"
            icon={Wallet}
            value={formatCurrency(netCashFlow)}
            sub="After expenses"
            actionLabel="View reports"
            valueClassName={netCashFlow >= 0 ? "text-success" : "text-danger"}
            href="/reports"
          />
        )}

        {canSeeStoreMoney && (
          <KpiCard
            label="Inventory"
            icon={Package}
            value={formatCurrency(metrics.inventoryValue)}
            sub={`${metrics.stockedProductCount} products`}
            actionLabel="View stock"
            href="/products"
          />
        )}

        {canSeeCustomers && (
          <KpiCard
            label="Owed to you"
            icon={Users}
            iconTone="bg-credit-container text-on-credit-container"
            value={customersOwingData !== undefined ? formatCurrency(customersOwingData.totalOwed) : "…"}
            sub={customersOwingData?.debtorCount ? `${customersOwingData.debtorCount} ${customersOwingData.debtorCount === 1 ? "debtor" : "debtors"}` : "Cleared"}
            actionLabel="View debtors"
            valueClassName={customersOwingData && customersOwingData.totalOwed > 0 ? "text-credit" : "text-on-surface"}
            href="/contacts?filter=debtors"
          />
        )}

        <KpiCard
          label="Low stock"
            icon={AlertTriangle}
            iconTone="bg-warning-container text-on-warning-container"
          value={String(metrics.lowStockCount)}
          sub={metrics.lowStockCount > 0 ? `${metrics.lowStockCount} items low` : "All healthy"}
          actionLabel={metrics.lowStockCount > 0 ? "View low stock" : undefined}
          valueClassName={metrics.lowStockCount > 0 ? "text-warning" : "text-on-surface"}
          href="/products?filter=low-stock"
        />
      </div>

      {/* Expiring Products Alert */}
      {metrics.expiringCount > 0 && (
        <RippleLink
          href="/products?filter=expiring"
          className="mt-3.5 flex w-full items-center justify-between gap-3 rounded-[var(--radius-card)] bg-danger-container text-on-danger-container px-4 py-3 text-left transition-all hover:brightness-95"
        >
          <span className="text-[length:var(--font-size-body)] font-medium">
            {metrics.expiringCount} {metrics.expiringCount === 1 ? "product" : "products"} expired or expiring soon
          </span>
        </RippleLink>
      )}

      {/* QUICK SELL / TOP SELLERS: Compact product rows with 1-tap + Sell */}
      {hasCapability(user, "POS_SELL") && metrics.topProducts.length > 0 && (
        <section className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-bold text-on-surface">
              Quick sell
            </h2>
            <RippleLink href="/products" className="text-xs font-semibold text-brand-accent hover:underline">
              All products →
            </RippleLink>
          </div>
          <div className="flex flex-col gap-2">
            {metrics.topProducts.map((p) => (
              <div
                key={p.id}
                className="flex min-h-[var(--touch-target-min)] w-full flex-wrap items-center justify-between gap-2 rounded-2xl bg-surface-container px-4 py-2.5 text-left shadow-elevation-1"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[length:var(--font-size-body)] font-semibold text-on-surface">{p.name}</p>
                  <p className="text-[length:var(--font-size-caption)] text-on-surface-muted mt-0.5">
                    {formatCurrency(p.sellPrice)}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${p.currentStock <= 5 ? "bg-warning-container text-on-warning-container" : "bg-success-container text-on-success-container"}`}>
                  {p.currentStock} in stock
                </span>
                <RippleLink
                  href={`/pos?add=${p.id}`}
                  className="relative flex h-8 items-center gap-1 rounded-full bg-brand-container px-3 text-xs font-semibold text-on-brand-container hover:brightness-95 active:scale-95 transition-all before:absolute before:-inset-2 before:content-['']"
                  aria-label={`Sell ${p.name}`}
                >
                  <span>+ Sell</span>
                </RippleLink>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* END-OF-DAY OPERATIONS: Close Day distinctly placed here */}
      {hasCapability(user, "SUBMIT_RECONCILIATION") && (
        <section className="mt-6">
          <RippleLink
            href="/close-day"
            className="flex items-center justify-between gap-3 rounded-2xl bg-surface-container p-4 hover:bg-surface-container-high transition-colors active:scale-[0.99]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-container text-on-brand-container">
                <CalendarCheck size={20} aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-on-surface truncate">Close Today&apos;s Register</p>
                <p className="text-xs text-on-surface-muted truncate">Check the day&apos;s cash against sales</p>
              </div>
            </div>
            <span className="shrink-0 text-xs font-semibold text-brand-accent hover:underline flex items-center gap-1">
              Close day →
            </span>
          </RippleLink>
        </section>
      )}

      {hasCapability(user, "MANAGE_EXPENSES") && (
        <AddExpenseSheet
          isOpen={isExpenseSheetOpen}
          onClose={() => setIsExpenseSheetOpen(false)}
        />
      )}
    </div>
  );
}
