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
import { useCurrentUser, hasAccountType } from "@/features/auth/use-current-user";
import { BUSINESS_MANAGEMENT_ACCOUNT_TYPES } from "@/features/auth/authorization";
import { EmailVerificationBanner } from "@/features/auth/EmailVerificationBanner";
import { useAlertBadgeCount } from "@/features/alerts/use-alert-center";
import { AddExpenseSheet } from "@/features/expenses/components/AddExpenseSheet";

/**
 * One KPI tile: label up top, big number + caption below.
 * Pure typography and tonal surface matching the reports design.
 */
function KpiCard({
  label,
  value,
  sub,
  onClick,
}: {
  label: string;
  value: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <RippleButton
      type="button"
      onClick={onClick}
      className="flex min-h-[var(--touch-target-min)] min-w-0 flex-col justify-between rounded-2xl bg-surface-container p-4 text-left hover:bg-surface-container-high transition-colors"
    >
      <p className="text-[length:var(--font-size-label)] font-medium text-on-surface-muted leading-tight">{label}</p>
      <div className="mt-2 min-w-0">
        <p className="truncate font-number text-lg font-bold tracking-tight tabular-nums text-on-surface sm:text-xl">
          {value}
        </p>
        <p className="mt-0.5 text-[length:var(--font-size-caption)] text-on-surface-muted leading-tight">{sub}</p>
      </div>
    </RippleButton>
  );
}

const CAN_CLOSE_DAY = BUSINESS_MANAGEMENT_ACCOUNT_TYPES;
const CAN_EDIT_PRODUCTS = BUSINESS_MANAGEMENT_ACCOUNT_TYPES;
const CAN_RECORD_EXPENSES = BUSINESS_MANAGEMENT_ACCOUNT_TYPES;
const CAN_RESTOCK = BUSINESS_MANAGEMENT_ACCOUNT_TYPES;

export default function DashboardPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const [branchId, setBranchId] = useState<string | null>(null);
  const [isExpenseSheetOpen, setIsExpenseSheetOpen] = useState(false);
  const branches = useLiveQuery(() => tenantArray(db.branches), [], []);
  // Revenue, cash flow, and customer debt follow the same view_sales
  // permission as /sales and /reports: inventory_staff sees none of it,
  // cashiers see only their own sales (never the full shop's), matching
  // "own_only" in src/types/permissions.ts.
  const canSeeMoney = user.accountType !== "WORKER";
  const viewerId = user.accountType === "WORKER" ? user.id : null;
  const metrics = useDashboardMetrics(branchId, viewerId);
  const totalOwed = useLiveQuery(async () => {
    if (!canSeeMoney) return 0;
    const balances = await getAllCustomerCreditBalances();
    return [...balances.values()].reduce((sum, b) => sum + Math.max(b, 0), 0);
  }, [canSeeMoney]);

  // Live query for email verification status — banner disappears without a
  // page reload once the owner enters the correct code in EmailVerificationBanner.
  const localUser = useLiveQuery(() => tenantGet<import("@/lib/db").LocalUser>(db.localUsers, user.id), [user.id]);
  const showVerificationBanner =
    user.accountType === "BUSINESS_OWNER" && localUser !== undefined && !localUser?.emailVerified;
    
  const allAlertsCount = useAlertBadgeCount();

  const netCashFlow = metrics ? (metrics.todaysCashSalesTotal - metrics.todaysExpensesTotal - metrics.todaysPurchasesTotal + metrics.todaysCreditCollected) : 0;

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
            onClick: () => router.push(hasAccountType(user, CAN_EDIT_PRODUCTS) ? "/products/new" : "/products"),
          }}
        />
      </div>
    );
  }

  return (
    <div>
      <ScreenHeader title="Dashboard" hideBack={true} />

      {/* Email verification banner — shown only to owner until email confirmed.
          Non-blocking: rendered above dashboard content, never as a modal. */}
      {showVerificationBanner && (
        <div className="mb-4">
          <EmailVerificationBanner userId={user.id} />
        </div>
      )}


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

      {allAlertsCount > 0 && (
        <RippleButton
          type="button"
          onClick={() => router.push("/alerts")}
          className="mb-4 flex w-full items-center justify-between gap-3 rounded-[var(--radius-card)] bg-brand-container text-on-brand-container px-4 py-3 text-left hover:brightness-95 transition-all"
        >
          <span className="text-[length:var(--font-size-body)] font-medium">
            {allAlertsCount} {allAlertsCount === 1 ? "alert" : "alerts"} need your attention
          </span>
          <Bell size={18} aria-hidden />
        </RippleButton>
      )}

      {canSeeMoney && (
        <RippleButton
          type="button"
          onClick={() => router.push("/products")}
          className="mb-3.5 flex w-full flex-col rounded-2xl bg-surface-container p-4.5 sm:p-5 text-left hover:bg-surface-container-high transition-colors"
        >
          <p className="text-[length:var(--font-size-label)] font-medium text-on-surface-muted">
            Inventory value
          </p>
          <p className="mt-1 truncate font-number text-2xl sm:text-3xl font-bold tracking-tight tabular-nums text-on-surface">
            {formatCurrency(metrics.inventoryValue)}
          </p>
          <p className="mt-1 text-[length:var(--font-size-caption)] text-on-surface-muted leading-tight">
            Stock at cost · {metrics.stockedProductCount} {metrics.stockedProductCount === 1 ? "product" : "products"} on hand
          </p>
        </RippleButton>
      )}

      <div className="grid grid-cols-2 gap-3">
        {canSeeMoney && (
          <KpiCard
            label={user.accountType === "WORKER" ? "Your sales today" : "Today's sales"}
            value={formatCurrency(metrics.todaysSalesTotal)}
            sub={`${metrics.todaysSalesCount} ${metrics.todaysSalesCount === 1 ? "sale" : "sales"} · ${formatCurrency(metrics.todaysCashSalesTotal)} cash · ${formatCurrency(Math.max(metrics.todaysSalesTotal - metrics.todaysCashSalesTotal, 0))} credit`}
            onClick={() => router.push("/sales")}
          />
        )}

        {canSeeMoney && user.accountType !== "WORKER" && (
          <KpiCard
            label="Net cash flow"
            value={formatCurrency(netCashFlow)}
            sub="After expenses & purchases"
            onClick={() => router.push("/reports")}
          />
        )}

        <KpiCard
          label="Low stock"
          value={String(metrics.lowStockCount)}
          sub="products below threshold"
          onClick={() => router.push("/products?filter=low-stock")}
        />

        {canSeeMoney && (
          <KpiCard
            label="Customers owing"
            value={totalOwed !== undefined ? formatCurrency(totalOwed) : "…"}
            sub="total debt"
            onClick={() => router.push("/customers")}
          />
        )}
      </div>

      {metrics.expiringCount > 0 && (
        <RippleButton
          type="button"
          onClick={() => router.push("/products?filter=expiring")}
          className="mt-4 flex w-full items-center justify-between gap-3 rounded-[var(--radius-card)] bg-danger-container text-on-danger-container px-4 py-3 text-left transition-all hover:brightness-95"
        >
          <span className="text-[length:var(--font-size-body)] font-medium">
            {metrics.expiringCount} {metrics.expiringCount === 1 ? "product" : "products"} expired or expiring soon
          </span>
        </RippleButton>
      )}

      {/* Quick Actions Hub — Clean, accessible 2x2 grid for high-frequency operations */}
      {(hasAccountType(user, CAN_RECORD_EXPENSES) ||
        hasAccountType(user, CAN_RESTOCK) ||
        hasAccountType(user, CAN_EDIT_PRODUCTS) ||
        hasAccountType(user, CAN_CLOSE_DAY)) && (
        <section className="mt-5">
          <h2 className="mb-2.5 text-[length:var(--font-size-label)] font-medium text-on-surface-muted">
            Quick Actions
          </h2>
          <div className="grid grid-cols-4 gap-2 sm:gap-2.5">
            {hasAccountType(user, CAN_RECORD_EXPENSES) && (
              <RippleButton
                type="button"
                onClick={() => setIsExpenseSheetOpen(true)}
                className="flex flex-col items-center justify-center py-3.5 px-1 rounded-2xl depth-card-interactive text-center min-h-[88px]"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-on-surface depth-bubble">
                  <Wallet size={20} aria-hidden />
                </div>
                <span className="mt-2 text-[11px] sm:text-xs font-medium text-on-surface text-center leading-tight">
                  Record Expense
                </span>
              </RippleButton>
            )}

            {hasAccountType(user, CAN_RESTOCK) && (
              <RippleButton
                type="button"
                onClick={() => router.push("/purchases/new")}
                className="flex flex-col items-center justify-center py-3.5 px-1 rounded-2xl depth-card-interactive text-center min-h-[88px]"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-on-surface depth-bubble">
                  <PackagePlus size={20} aria-hidden />
                </div>
                <span className="mt-2 text-[11px] sm:text-xs font-medium text-on-surface text-center leading-tight">
                  Restock
                </span>
              </RippleButton>
            )}

            {hasAccountType(user, CAN_EDIT_PRODUCTS) && (
              <RippleButton
                type="button"
                onClick={() => router.push("/products/new")}
                className="flex flex-col items-center justify-center py-3.5 px-1 rounded-2xl depth-card-interactive text-center min-h-[88px]"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-on-surface depth-bubble">
                  <Plus size={20} aria-hidden />
                </div>
                <span className="mt-2 text-[11px] sm:text-xs font-medium text-on-surface text-center leading-tight">
                  Add Product
                </span>
              </RippleButton>
            )}

            {hasAccountType(user, CAN_CLOSE_DAY) && (
              <RippleButton
                type="button"
                onClick={() => router.push("/close-day")}
                className="flex flex-col items-center justify-center py-3.5 px-1 rounded-2xl depth-card-interactive text-center min-h-[88px]"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-on-surface depth-bubble">
                  <CalendarCheck size={20} aria-hidden />
                </div>
                <span className="mt-2 text-[11px] sm:text-xs font-medium text-on-surface text-center leading-tight">
                  Close Day
                </span>
              </RippleButton>
            )}
          </div>
        </section>
      )}

      {metrics.topProducts && metrics.topProducts.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-[length:var(--font-size-label)] font-medium text-on-surface-muted">
            Quick Sell / Top Sellers
          </h2>
          <div className="flex flex-col gap-2">
            {metrics.topProducts.map((p) => (
              <RippleButton
                key={p.id}
                type="button"
                onClick={() => router.push(`/pos?add=${p.id}`)}
                className="flex min-h-[var(--touch-target-min)] w-full items-center justify-between gap-3 rounded-[var(--radius-card)] bg-surface-container px-4 py-3 text-left hover:bg-surface-container-high active:scale-98 transition-all"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[length:var(--font-size-body-lg)] font-medium text-on-surface">{p.name}</p>
                  <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
                    {formatCurrency(p.sellPrice)} · {p.currentStock} in stock
                  </p>
                </div>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-container text-on-brand-container font-semibold text-lg" aria-hidden>
                  +
                </span>
              </RippleButton>
            ))}
          </div>
        </section>
      )}

      {hasAccountType(user, CAN_RECORD_EXPENSES) && (
        <AddExpenseSheet
          isOpen={isExpenseSheetOpen}
          onClose={() => setIsExpenseSheetOpen(false)}
        />
      )}
    </div>
  );
}
