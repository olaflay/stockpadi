"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Store,
  Bell,
  Wallet,
  PackagePlus,
  Plus,
  CalendarCheck,
  Receipt,
  ArrowRight,
  ClipboardCheck,
} from "lucide-react";
import { db } from "@/lib/db";
import { tenantArray, tenantGet } from "@/lib/local-tenant";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { formatCurrency } from "@/lib/format";
import { useDashboardMetrics } from "@/features/dashboard/use-dashboard-metrics";
import { getAllCustomerCreditBalances } from "@/features/customers/credit";
import { SelectInput } from "@/components/ui/SelectInput";
import { RippleButton } from "@/components/ui/Ripple";
import { RippleLink } from "@/components/ui/Ripple";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { hasCapability } from "@/features/auth/authorization";
import { EmailVerificationBanner } from "@/features/auth/EmailVerificationBanner";
import { useAlertBadgeCount } from "@/features/alerts/use-alert-center";
import { AddExpenseSheet } from "@/features/expenses/components/AddExpenseSheet";

/** Format hero card date with ordinal suffix, e.g. "Friday, 2nd of October" */
function formatDashboardHeroDate(date: Date = new Date()): string {
  const weekday = date.toLocaleDateString("en-GB", { weekday: "long" });
  const day = date.getDate();
  const month = date.toLocaleDateString("en-GB", { month: "long" });
  const getOrdinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  };
  return `${weekday}, ${day}${getOrdinal(day)} of ${month}`;
}

/**
 * One KPI tile: label up top, big number + caption below, and optional actionable prompt.
 * Pure typography and tonal surface matching Samsung One UI / M3 design tokens.
 */
function KpiCard({
  label,
  value,
  sub,
  actionLabel,
  valueClassName = "text-on-surface",
  href,
  onClick,
}: {
  label: string;
  value: string;
  sub: string;
  actionLabel?: string;
  valueClassName?: string;
  href?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <p className="text-[11px] sm:text-xs font-medium text-on-surface-muted leading-tight truncate">
        {label}
      </p>
      <div className="mt-1.5 min-w-0">
        <p className={`truncate font-number text-lg font-bold tracking-tight tabular-nums sm:text-xl ${valueClassName}`}>
          {value}
        </p>
        <p className="mt-0.5 text-[11px] sm:text-xs text-on-surface-muted leading-tight truncate">
          {sub}
        </p>
      </div>
      {actionLabel && (
        <span className="mt-2 text-[11px] font-semibold text-brand-accent hover:underline flex items-center gap-0.5">
          {actionLabel}
        </span>
      )}
    </>
  );

  const className = "flex min-h-[var(--touch-target-min)] min-w-0 flex-col justify-between rounded-2xl bg-surface-container p-3.5 sm:p-4 text-left hover:bg-surface-container-high transition-colors";

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
      label: "Add product",
      href: "/products/new",
      icon: Plus,
    },
    hasCapability(user, "RECEIVE_STOCK") && {
      key: "restock",
      label: "Receive delivery",
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
      label: "Stock count",
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
    
  const allAlertsCount = useAlertBadgeCount();

  const netCashFlow = metrics
    ? (metrics.todaysCashSalesTotal - metrics.todaysExpensesTotal - metrics.todaysPurchasesTotal + metrics.todaysCreditCollected)
    : 0;

  if (metrics === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <ScreenHeader title="Dashboard" hideBack={true} />
        <Skeleton className="h-28 w-full" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <div className="mt-1 flex flex-col gap-3">
          <Skeleton className="h-5 w-32" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
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
    <div className="pb-16">
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

      {/* Alerts notification strip */}
      {allAlertsCount > 0 && (
        <RippleLink
          href="/alerts"
          className="mb-4 flex w-full items-center justify-between gap-3 rounded-[var(--radius-card)] bg-brand-container text-on-brand-container px-4 py-3 text-left hover:brightness-95 transition-all"
        >
          <span className="text-[length:var(--font-size-body)] font-medium">
            {allAlertsCount} {allAlertsCount === 1 ? "alert" : "alerts"} need your attention
          </span>
          <Bell size={18} aria-hidden />
        </RippleLink>
      )}

      {/* PRIMARY HERO CARD: Today's Sales */}
      {canSeeOwnSales && (
        <div className="mb-3 flex w-full flex-col rounded-3xl bg-surface-container p-4 sm:p-5 text-left border border-border/20 shadow-xs">
          {/* Small top header with label in capital letters and dynamic date */}
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-on-surface-muted">
              {user.accountType === "WORKER" ? "YOUR SALES TODAY" : "TODAY'S SALES"}
            </p>
            <span className="text-[11px] sm:text-xs font-medium text-on-surface-muted shrink-0">
              {formatDashboardHeroDate()}
            </span>
          </div>

          {/* Bold Tabular Total */}
          <p className="mt-2 truncate font-number text-2xl sm:text-3xl font-bold tracking-tight tabular-nums text-on-surface">
            {formatCurrency(metrics.todaysSalesTotal)}
          </p>

          {/* High-signal Breakdown */}
          <p className="mt-1 text-[length:var(--font-size-caption)] text-on-surface-muted leading-tight">
            {metrics.todaysSalesCount} {metrics.todaysSalesCount === 1 ? "sale" : "sales"} · {formatCurrency(metrics.todaysPaidSalesTotal)} cash · {formatCurrency(metrics.todaysCreditSalesTotal)} credit
          </p>

          {/* M3 / One UI Tonal Action Card for View Sales & Receipts */}
          <RippleLink
            href="/sales"
            className="mt-3.5 flex items-center justify-between rounded-2xl bg-surface-container-high hover:bg-surface-container-highest active:scale-[0.99] px-4 py-3 text-xs text-on-surface transition-all shadow-xs border border-border/40 group"
          >
            <span className="font-semibold text-on-surface text-[13px]">View sales & receipts</span>
            <div className="flex items-center gap-1.5 text-on-surface-variant group-hover:text-brand-accent transition-colors">
              <span className="text-[12px] font-medium">{metrics.todaysSalesCount} recorded</span>
              <ArrowRight size={15} className="text-brand-accent group-hover:translate-x-0.5 transition-transform" />
            </div>
          </RippleLink>
        </div>
      )}

      {/* SECONDARY METRICS: 2x2 Grid */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        {canSeeStoreMoney && (
          <KpiCard
            label="Net Cash"
            value={formatCurrency(netCashFlow)}
            sub="After expenses"
            actionLabel="Reports →"
            valueClassName={netCashFlow >= 0 ? "text-success" : "text-danger"}
            href="/reports"
          />
        )}

        {canSeeStoreMoney && (
          <KpiCard
            label="Inventory"
            value={formatCurrency(metrics.inventoryValue)}
            sub={`${metrics.stockedProductCount} products`}
            actionLabel="Stock →"
            href="/products"
          />
        )}

        {canSeeCustomers && (
          <KpiCard
            label="Owed to You"
            value={customersOwingData !== undefined ? formatCurrency(customersOwingData.totalOwed) : "…"}
            sub={customersOwingData?.debtorCount ? `${customersOwingData.debtorCount} ${customersOwingData.debtorCount === 1 ? "debtor" : "debtors"}` : "Cleared"}
            actionLabel="Debtors →"
            valueClassName={customersOwingData && customersOwingData.totalOwed > 0 ? "text-danger" : "text-on-surface"}
            href="/contacts?tab=debtors"
          />
        )}

        <KpiCard
          label="Low Stock"
          value={String(metrics.lowStockCount)}
          sub={metrics.lowStockCount > 0 ? `${metrics.lowStockCount} items low` : "All healthy"}
          actionLabel={metrics.lowStockCount > 0 ? "View low stock →" : undefined}
          valueClassName={metrics.lowStockCount > 0 ? "text-warning" : "text-on-surface"}
          href="/products?filter=low-stock"
        />
      </div>

      {/* 4-GRID ACTION TILES: Unified containers with brand-green icons across all actions */}
      {quickActions.length > 0 && (
        <div
          className={`mt-3.5 rounded-3xl bg-surface-container p-3 sm:p-4 grid gap-2 sm:gap-3 ${
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
                  className="group flex flex-col items-center justify-center py-1.5 px-1 text-center min-w-0 active:scale-95 transition-transform"
                >
                  <div className="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-2xl bg-surface-container-highest text-brand-accent shadow-xs group-hover:bg-brand-container/40 group-hover:text-brand-accent transition-all">
                    <Icon size={22} strokeWidth={2.4} aria-hidden />
                  </div>
                  <span className="mt-2 text-xs sm:text-[13px] font-medium text-on-surface group-hover:text-brand-accent text-center leading-tight truncate w-full transition-colors">
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
                className="group flex flex-col items-center justify-center py-1.5 px-1 text-center min-w-0 active:scale-95 transition-transform"
              >
                <div className="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-2xl bg-surface-container-highest text-brand-accent shadow-xs group-hover:bg-brand-container/40 group-hover:text-brand-accent transition-all">
                  <Icon size={22} strokeWidth={2.4} aria-hidden />
                </div>
                <span className="mt-2 text-xs sm:text-[13px] font-medium text-on-surface group-hover:text-brand-accent text-center leading-tight truncate w-full transition-colors">
                  {action.label}
                </span>
              </RippleButton>
            );
          })}
        </div>
      )}

      {/* Expiring Products Alert */}
      {metrics.expiringCount > 0 && (
        <RippleLink
          href="/products?filter=expiring"
          className="mt-3 flex w-full items-center justify-between gap-3 rounded-[var(--radius-card)] bg-danger-container text-on-danger-container px-4 py-3 text-left transition-all hover:brightness-95"
        >
          <span className="text-[length:var(--font-size-body)] font-medium">
            {metrics.expiringCount} {metrics.expiringCount === 1 ? "product" : "products"} expired or expiring soon
          </span>
        </RippleLink>
      )}

      {/* QUICK SELL / TOP SELLERS: Compact product rows with 1-tap + Sell */}
      {metrics.topProducts && metrics.topProducts.length > 0 && (
        <section className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[length:var(--font-size-label)] font-medium text-on-surface-muted">
              Quick Sell
            </h2>
            <RippleLink href="/products" className="text-xs font-semibold text-brand-accent hover:underline">
              All products →
            </RippleLink>
          </div>
          <div className="divide-y divide-outline-variant/30 rounded-3xl bg-surface-container/60 border border-outline-variant/30 overflow-hidden shadow-xs">
            {metrics.topProducts.map((p) => (
              <div
                key={p.id}
                className="flex min-h-[var(--touch-target-min)] w-full items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-surface-container-high/40 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[length:var(--font-size-body)] font-semibold text-on-surface">{p.name}</p>
                  <p className="text-[length:var(--font-size-caption)] text-on-surface-muted mt-0.5">
                    {formatCurrency(p.sellPrice)} · <span className={p.currentStock <= 5 ? "text-warning font-medium" : ""}>{p.currentStock} in stock</span>
                  </p>
                </div>
                <RippleLink
                  href={`/pos?add=${p.id}`}
                  className="flex h-8 items-center gap-1 rounded-full bg-brand-container px-3 text-xs font-semibold text-on-brand-container hover:brightness-95 active:scale-95 transition-all"
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
                <p className="text-xs text-on-surface-muted truncate">End-of-day cash reconciliation</p>
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
