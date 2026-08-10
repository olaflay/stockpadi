"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db, BUSINESS_PROFILE_SINGLETON_ID } from "@/lib/db";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { RippleButton } from "@/components/ui/Ripple";
import { formatCurrency } from "@/lib/format";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { useCurrentUser, hasRole } from "@/features/auth/use-current-user";
import { BalancedIllustration } from "@/components/illustrations";
import { computeGrossProfit, computeNetProfit } from "@/features/reports/compute-profit";
import type { PaymentMethod } from "@/types/sale";

const CAN_CLOSE_DAY = ["owner", "manager", "accountant", "admin"] as const;

/**
 * The ritual every shop owner does at night, promoted to its own screen
 * (docs/RESEARCH-AND-PLAN.md Phase 1 item 10 — it previously lived as a
 * modal buried inside Reports). Reachable from Dashboard and Reports alike.
 */
export default function CloseDayPage() {
  const user = useCurrentUser();
  const router = useRouter();
  const [countedCashInput, setCountedCashInput] = useState("");

  const result = useLiveQuery(async () => {
    try {
      const [sales, products, expenses, profile] = await Promise.all([
        db.sales.toArray(),
        db.products.toArray(),
        db.expenses.toArray(),
        db.businessProfile.get(BUSINESS_PROFILE_SINGLETON_ID),
      ]);
      return { sales, products, expenses, profile, error: null as string | null };
    } catch (err) {
      return {
        sales: [],
        products: [],
        expenses: [],
        profile: undefined,
        error: err instanceof Error ? err.message : "Could not load today's sales.",
      };
    }
  }, []);

  if (!hasRole(user, [...CAN_CLOSE_DAY])) {
    return (
      <div>
        <ScreenHeader title="Close day" onBack={() => router.push("/reports")} />
        <PermissionDenied requiredRoles={[...CAN_CLOSE_DAY]} />
      </div>
    );
  }

  if (result === undefined) {
    return (
      <div>
        <ScreenHeader title="Close day" onBack={() => router.push("/reports")} />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (result.error) {
    return (
      <div>
        <ScreenHeader title="Close day" onBack={() => router.push("/reports")} />
        <ErrorState message="Couldn't load today's sales." onRetry={() => window.location.reload()} />
      </div>
    );
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  const todaySales = result.sales.filter((sale) => !sale.voidedAt && sale.createdAtLocal >= todayIso);
  const todaySalesTotal = todaySales.reduce((sum, s) => sum + s.total, 0);
  const todayExpenses = result.expenses.filter((e) => e.createdAtLocal >= todayIso);
  const todayExpensesTotal = todayExpenses.reduce((sum, e) => sum + e.amount, 0);

  // A sale can be split across methods (docs/RESEARCH-AND-PLAN.md finding
  // 1.1-A), so these sum the per-payment amounts, not whole sales grouped by
  // a single tag — one sale can now contribute to more than one bucket.
  const totalByMethod = (method: PaymentMethod) =>
    todaySales.reduce(
      (sum, sale) => sum + (sale.payments ?? []).filter((p) => p.method === method).reduce((s, p) => s + p.amount, 0),
      0
    );
  const cashTotal = totalByMethod("cash");
  const transferTotal = totalByMethod("transfer");
  const posTotal = totalByMethod("pos_terminal");
  const creditTotal = totalByMethod("credit");

  const grossProfit = computeGrossProfit(todaySales, result.products);
  const netProfit = computeNetProfit(grossProfit, todayExpenses);
  const whatsappNumber = result.profile?.whatsappNumber;

  const counted = Number(countedCashInput);
  const hasCount = countedCashInput.trim() !== "" && !Number.isNaN(counted);
  const variance = hasCount ? counted - cashTotal : null;
  const isBalanced = hasCount && Math.abs(variance ?? 0) < 0.5;

  function shareOnWhatsApp() {
    const shareMessage =
      `*Close Day Summary - ${new Date().toLocaleDateString("en-NG")}*\n` +
      `Sales: ${formatCurrency(todaySalesTotal)}\n` +
      `Transactions: ${todaySales.length}\n` +
      `Cash: ${formatCurrency(cashTotal)}\n` +
      `Transfer: ${formatCurrency(transferTotal)}\n` +
      `POS: ${formatCurrency(posTotal)}\n` +
      `Credit: ${formatCurrency(creditTotal)}\n` +
      `Expenses: ${formatCurrency(todayExpensesTotal)}\n` +
      `Est. Net Profit: ${formatCurrency(netProfit)}` +
      (hasCount
        ? `\nCash counted: ${formatCurrency(counted)} (${
            isBalanced ? "balanced" : (variance ?? 0) > 0 ? `+${formatCurrency(variance ?? 0)}` : `-${formatCurrency(-(variance ?? 0))}`
          })`
        : "");
    // Shares straight to the owner's own number, set once in Settings —
    // never WhatsApp's contact picker. Falls back to the picker only if no
    // number has been saved yet.
    window.open(buildWhatsAppUrl(whatsappNumber, shareMessage), "_blank");
  }

  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader title="Close day" onBack={() => router.push("/reports")} />

      <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface-container p-4">
        <div className="flex justify-between">
          <span className="text-on-surface-muted">Today&apos;s sales</span>
          <span className="font-semibold text-on-surface">{formatCurrency(todaySalesTotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-on-surface-muted">Transactions</span>
          <span className="font-semibold text-on-surface">{todaySales.length}</span>
        </div>
        <hr className="border-border" />
        <div className="flex justify-between text-[length:var(--font-size-body)]">
          <span className="text-on-surface-muted">Cash</span>
          <span className="font-medium text-on-surface">{formatCurrency(cashTotal)}</span>
        </div>
        <div className="flex justify-between text-[length:var(--font-size-body)]">
          <span className="text-on-surface-muted">Transfer</span>
          <span className="font-medium text-on-surface">{formatCurrency(transferTotal)}</span>
        </div>
        <div className="flex justify-between text-[length:var(--font-size-body)]">
          <span className="text-on-surface-muted">POS Terminal</span>
          <span className="font-medium text-on-surface">{formatCurrency(posTotal)}</span>
        </div>
        <div className="flex justify-between text-[length:var(--font-size-body)]">
          <span className="text-on-surface-muted">Customer credit</span>
          <span className="font-medium text-on-surface">{formatCurrency(creditTotal)}</span>
        </div>
        <hr className="border-border" />
        <div className="flex justify-between text-[length:var(--font-size-body)]">
          <span className="text-on-surface-muted">Expenses today</span>
          <span className="font-medium text-on-surface">−{formatCurrency(todayExpensesTotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-on-surface-muted">Est. net profit</span>
          <span className={`font-semibold ${netProfit >= 0 ? "text-success" : "text-danger"}`}>
            {formatCurrency(netProfit)}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-surface p-4">
        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Cash counted in drawer</span>
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={countedCashInput}
            onChange={(event) => setCountedCashInput(event.target.value)}
            placeholder={formatCurrency(cashTotal)}
            className="min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[length:var(--font-size-body)] text-on-surface"
          />
        </label>
        {hasCount &&
          (isBalanced ? (
            <div className="flex items-center gap-2 animate-step-in">
              <BalancedIllustration className="h-10 w-10 shrink-0" />
              <p className="text-[length:var(--font-size-body)] font-medium text-success">
                Balanced - matches expected cash sales.
              </p>
            </div>
          ) : (
            <p className={`text-[length:var(--font-size-body)] font-medium ${(variance ?? 0) > 0 ? "text-warning" : "text-danger"}`}>
              {(variance ?? 0) > 0
                ? `${formatCurrency(variance ?? 0)} more than expected.`
                : `${formatCurrency(-(variance ?? 0))} short of expected.`}
            </p>
          ))}
      </div>

      <RippleButton
        type="button"
        onClick={shareOnWhatsApp}
        className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-brand-accent px-5 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast hover:opacity-90 transition-opacity"
      >
        Share on WhatsApp
      </RippleButton>
    </div>
  );
}
