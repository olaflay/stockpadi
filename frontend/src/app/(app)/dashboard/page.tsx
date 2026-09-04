"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Store,
  Bell,
  TrendingUp,
  TrendingDown,
  Activity,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
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
import { PerformancePill } from "@/components/ui/PerformancePill";
import { ICON_TONE_CLASSES } from "@/components/ui/icon-tone";
import { useCurrentUser, hasAccountType } from "@/features/auth/use-current-user";
import { BUSINESS_MANAGEMENT_ACCOUNT_TYPES } from "@/features/auth/authorization";
import { EmailVerificationBanner } from "@/features/auth/EmailVerificationBanner";
import { useAlertBadgeCount } from "@/features/alerts/use-alert-center";
import { AddExpenseSheet } from "@/features/expenses/components/AddExpenseSheet";

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
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="col-span-2 h-16" />
        </div>
        <div className="mt-4 flex flex-col gap-3">
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
      <div className="flex flex-col h-screen">
        <ScreenHeader title="Dashboard" hideBack={true} />
        <EmptyState
          icon={Store}
          title="Let's get your shop set up"
          description="Add your first product and this screen fills in with your sales and stock numbers."
          action={{
            label: "Add a product",
            onClick: () => router.push(hasAccountType(user, CAN_EDIT_PRODUCTS) ? "/products/new" : "/products"),
          }}
          fullScreen
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
          className="mb-4 flex w-full items-center justify-between gap-3 rounded-[var(--radius-card)] border border-brand-accent/20 bg-brand-accent/10 px-4 py-3 text-left hover:bg-brand-accent/15 transition-colors"
        >
          <span className="text-[length:var(--font-size-body)] font-medium text-brand-accent">
            {allAlertsCount} {allAlertsCount === 1 ? "alert" : "alerts"} need your attention
          </span>
          <Bell size={18} className="text-brand-accent" aria-hidden />
        </RippleButton>
      )}

      <div className="grid grid-cols-2 gap-3">
        {canSeeMoney && (
          <RippleButton
            type="button"
            onClick={() => router.push("/sales")}
            className="min-h-[var(--touch-target-min)] min-w-0 rounded-[var(--radius-card)] bg-surface-container p-3.5 sm:p-4 text-left hover:bg-surface-container-high active:scale-[0.99] transition-all flex flex-col justify-between"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
                {user.accountType === "WORKER" ? "Your sales today" : "Today's sales"}
              </p>
              <ChevronRight size={14} className="text-on-surface-muted/50 shrink-0" />
            </div>
            <div>
              <p className="mt-1 truncate font-number text-lg sm:text-xl font-bold tracking-tight tabular-nums text-on-surface">
                {formatCurrency(metrics.todaysSalesTotal)}
              </p>
              <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
                {metrics.todaysSalesCount} {metrics.todaysSalesCount === 1 ? "sale" : "sales"}
              </p>
            </div>
          </RippleButton>
        )}

        {canSeeMoney && user.accountType !== "WORKER" && (
          <RippleButton
            type="button"
            onClick={() => router.push("/reports")}
            className="min-h-[var(--touch-target-min)] min-w-0 rounded-[var(--radius-card)] bg-surface-container p-3.5 sm:p-4 text-left hover:bg-surface-container-high active:scale-[0.99] transition-all flex flex-col justify-between"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">Net cash flow</p>
              <ChevronRight size={14} className="text-on-surface-muted/50 shrink-0" />
            </div>
            <div>
              <p className={`mt-1 truncate font-number text-lg sm:text-xl font-bold tracking-tight tabular-nums ${netCashFlow < 0 ? 'text-danger' : 'text-success'}`}>
                {formatCurrency(netCashFlow)}
              </p>
              <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
                After expenses & purchases
              </p>
            </div>
          </RippleButton>
        )}

        <RippleButton
          type="button"
          onClick={() => router.push("/products?filter=low-stock")}
          className="min-h-[var(--touch-target-min)] min-w-0 rounded-[var(--radius-card)] bg-surface-container p-3.5 sm:p-4 text-left hover:bg-surface-container-high active:scale-[0.99] transition-all flex flex-col justify-between"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">Low stock</p>
            <ChevronRight size={14} className="text-on-surface-muted/50 shrink-0" />
          </div>
          <div>
            <p className="mt-1 truncate font-number text-lg sm:text-xl font-bold tracking-tight tabular-nums text-on-surface">
              {metrics.lowStockCount}
            </p>
            <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">products below threshold</p>
          </div>
        </RippleButton>

        {canSeeMoney && (
          <RippleButton
            type="button"
            onClick={() => router.push("/customers")}
            className="min-h-[var(--touch-target-min)] min-w-0 rounded-[var(--radius-card)] bg-surface-container p-3.5 sm:p-4 text-left hover:bg-surface-container-high active:scale-[0.99] transition-all flex flex-col justify-between"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">Customers Owing</p>
              <ChevronRight size={14} className="text-on-surface-muted/50 shrink-0" />
            </div>
            <div>
              <p className="mt-1 truncate font-number text-lg sm:text-xl font-bold tracking-tight tabular-nums text-on-surface">
                {totalOwed !== undefined ? formatCurrency(totalOwed) : "…"}
              </p>
              <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">total debt</p>
            </div>
          </RippleButton>
        )}
      </div>

      {/* Quick Actions Hub — Clean, accessible 2x2 grid for high-frequency operations */}
      {(hasAccountType(user, CAN_RECORD_EXPENSES) ||
        hasAccountType(user, CAN_RESTOCK) ||
        hasAccountType(user, CAN_EDIT_PRODUCTS) ||
        hasAccountType(user, CAN_CLOSE_DAY)) && (
        <section className="mt-5">
          <h2 className="mb-2.5 text-[length:var(--font-size-label)] font-medium text-on-surface-muted">
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            {hasAccountType(user, CAN_RECORD_EXPENSES) && (
              <RippleButton
                type="button"
                onClick={() => setIsExpenseSheetOpen(true)}
                className="flex min-h-[56px] items-center gap-3 rounded-[var(--radius-card)] border border-border/60 bg-surface p-3 text-left hover:bg-surface-container active:scale-[0.98] transition-all"
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${ICON_TONE_CLASSES.warning}`}>
                  <Wallet size={20} aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[length:var(--font-size-body)] font-medium text-on-surface">
                    Record Expense
                  </p>
                  <p className="truncate text-[length:var(--font-size-caption)] text-on-surface-muted">
                    Log shop payout
                  </p>
                </div>
              </RippleButton>
            )}

            {hasAccountType(user, CAN_RESTOCK) && (
              <RippleButton
                type="button"
                onClick={() => router.push("/purchases/new")}
                className="flex min-h-[56px] items-center gap-3 rounded-[var(--radius-card)] border border-border/60 bg-surface p-3 text-left hover:bg-surface-container active:scale-[0.98] transition-all"
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${ICON_TONE_CLASSES.brand}`}>
                  <PackagePlus size={20} aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[length:var(--font-size-body)] font-medium text-on-surface">
                    Restock
                  </p>
                  <p className="truncate text-[length:var(--font-size-caption)] text-on-surface-muted">
                    Receive inventory
                  </p>
                </div>
              </RippleButton>
            )}

            {hasAccountType(user, CAN_EDIT_PRODUCTS) && (
              <RippleButton
                type="button"
                onClick={() => router.push("/products/new")}
                className="flex min-h-[56px] items-center gap-3 rounded-[var(--radius-card)] border border-border/60 bg-surface p-3 text-left hover:bg-surface-container active:scale-[0.98] transition-all"
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${ICON_TONE_CLASSES.success}`}>
                  <Plus size={20} aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[length:var(--font-size-body)] font-medium text-on-surface">
                    Add Product
                  </p>
                  <p className="truncate text-[length:var(--font-size-caption)] text-on-surface-muted">
                    New catalog item
                  </p>
                </div>
              </RippleButton>
            )}

            {hasAccountType(user, CAN_CLOSE_DAY) && (
              <RippleButton
                type="button"
                onClick={() => router.push("/close-day")}
                className="flex min-h-[56px] items-center gap-3 rounded-[var(--radius-card)] border border-border/60 bg-surface p-3 text-left hover:bg-surface-container active:scale-[0.98] transition-all"
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${ICON_TONE_CLASSES.neutral}`}>
                  <CalendarCheck size={20} aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[length:var(--font-size-body)] font-medium text-on-surface">
                    Close Day
                  </p>
                  <p className="truncate text-[length:var(--font-size-caption)] text-on-surface-muted">
                    Reconcile register
                  </p>
                </div>
              </RippleButton>
            )}
          </div>
        </section>
      )}

      {metrics.expiringCount > 0 && (
        <button
          type="button"
          onClick={() => router.push("/products?filter=expiring")}
          className="mt-4 flex w-full items-center justify-between gap-3 rounded-[var(--radius-card)] border border-stock-alert/20 bg-stock-alert/10 px-4 py-3 text-left hover:bg-stock-alert/15 transition-colors"
        >
          <span className="text-[length:var(--font-size-body)] text-stock-alert">
            {metrics.expiringCount} {metrics.expiringCount === 1 ? "product" : "products"} expired or expiring soon
          </span>
        </button>
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
                className="flex min-h-[var(--touch-target-min)] w-full items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border bg-surface px-4 py-3 text-left hover:bg-surface-container active:scale-98 transition-all"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[length:var(--font-size-body-lg)] font-medium text-on-surface">{p.name}</p>
                  <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
                    {formatCurrency(p.sellPrice)} · {p.currentStock} in stock
                  </p>
                </div>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-accent/10 text-brand-accent font-semibold text-lg" aria-hidden>
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
