"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Wallet, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { FAB } from "@/components/ui/FAB";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency } from "@/lib/format";
import { useCurrentUser, hasAccountType } from "@/features/auth/use-current-user";
import { BUSINESS_MANAGEMENT_ACCOUNT_TYPES } from "@/features/auth/authorization";
import { deleteExpense } from "@/features/expenses/add-expense";
import { serverGet } from "@/features/operations/server-client";
import { tenantArray } from "@/lib/local-tenant";
import type { LocalBranch, LocalUser } from "@/lib/db";
import type { Expense } from "@/types/expense";

const CAN_VIEW_EXPENSES = BUSINESS_MANAGEMENT_ACCOUNT_TYPES;
// Matches the expenses_delete RLS policy in
// supabase/migrations/20260807054734_rls_policies.sql: manager is "limited"
// to insert + view, delete stays owner/accountant/admin only.
const CAN_DELETE_EXPENSES = BUSINESS_MANAGEMENT_ACCOUNT_TYPES;

type Period = "today" | "week" | "month";
const PERIOD_LABELS: Record<Period, string> = { today: "Today", week: "This week", month: "This month" };

function periodStartIso(period: Period): string {
  const now = new Date();
  if (period === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  if (period === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    return new Date(start.getFullYear(), start.getMonth(), start.getDate()).toISOString();
  }
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

export default function ExpensesPage() {
  const user = useCurrentUser();
  const router = useRouter();
  const { showToast } = useToast();
  const [period, setPeriod] = useState<Period>("today");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const result = useLiveQuery(async () => {
    try {
      const [branches, users] = await Promise.all([tenantArray<LocalBranch>(db.branches), tenantArray<LocalUser>(db.localUsers)]);
      let expenses;
      try {
        const remote = await serverGet<{ expenses: Array<Record<string, unknown>> }>("/api/expenses");
        expenses = remote.expenses.map((expense) => ({ id: expense.id as string, branchId: expense.branch_id as string | null, category: expense.category as string, amount: Number(expense.amount), note: expense.note as string | null, createdAtLocal: expense.created_at as string, createdByUserId: expense.created_by_user_id as string }));
      } catch {
        expenses = await tenantArray<Expense>(db.expenses.orderBy("createdAtLocal").reverse());
      }
      return { expenses, branches, users, error: null as string | null };
    } catch (err) {
      return {
        expenses: [],
        branches: [],
        users: [],
        error: err instanceof Error ? err.message : "Could not load expenses.",
      };
    }
  }, []);

  if (!hasAccountType(user, CAN_VIEW_EXPENSES)) {
    return (
      <div>
        <ScreenHeader title="Expenses" onBack={() => router.push("/reports")} />
        <PermissionDenied requiredAccountTypes={CAN_VIEW_EXPENSES} />
      </div>
    );
  }

  if (result === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <ScreenHeader title="Expenses" onBack={() => router.push("/reports")} />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      </div>
    );
  }

  if (result.error) {
    return (
      <div>
        <ScreenHeader title="Expenses" onBack={() => router.push("/reports")} />
        <ErrorState message="Couldn't load your expenses." onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (result.expenses.length === 0) {
    return (
      <div className="flex flex-col h-screen">
        <ScreenHeader title="Expenses" onBack={() => router.push("/reports")} />
        <EmptyState
          icon={Wallet}
          title="No expenses recorded"
          description="Rent, transport, supplies - log what goes out so the profit number is real."
          fullScreen
        />
        <FAB href="/expenses/new" label="Add expense">
          <Plus size={26} aria-hidden />
        </FAB>
      </div>
    );
  }

  const periodStart = periodStartIso(period);
  const periodExpenses = result.expenses.filter((e) => e.createdAtLocal >= periodStart);
  const periodTotal = periodExpenses.reduce((sum, e) => sum + e.amount, 0);
  const canDelete = hasAccountType(user, CAN_DELETE_EXPENSES);

  async function handleDelete(id: string, category: string) {
    if (!confirm(`Delete this ${category} expense? This cannot be undone.`)) return;
    await deleteExpense(id);
    showToast("Expense deleted", "success");
  }

  return (
    <div>
      <ScreenHeader title="Expenses" onBack={() => router.push("/reports")} />

      <div className="mb-3 flex gap-2">
        {(Object.keys(PERIOD_LABELS) as Period[]).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={period === key}
            onClick={() => setPeriod(key)}
            className={`min-h-[var(--touch-target-min)] flex-1 rounded-[var(--radius-control)] px-3 text-[length:var(--font-size-body)] transition-colors ${
              period === key
                ? "bg-brand-accent text-brand-accent-contrast"
                : "bg-surface-container text-on-surface-muted hover:bg-surface-container-high"
            }`}
          >
            {PERIOD_LABELS[key]}
          </button>
        ))}
      </div>

      <section className="mb-4 rounded-[var(--radius-focus-block)] bg-surface-container p-5">
        <p className="text-[length:var(--font-size-label)] text-on-surface-muted">
          Spent, {PERIOD_LABELS[period].toLowerCase()}
        </p>
        <p className="mt-1 truncate font-mono text-[length:var(--font-size-display)] font-semibold tabular-nums text-on-surface">
          {formatCurrency(periodTotal)}
        </p>
        <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
          {periodExpenses.length} {periodExpenses.length === 1 ? "expense" : "expenses"}
        </p>
      </section>

      {periodExpenses.length === 0 ? (
        <p className="text-[length:var(--font-size-body)] text-on-surface-muted">
          No expenses {period === "today" ? "today" : `in ${PERIOD_LABELS[period].toLowerCase()}`} yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2 pb-20">
          {periodExpenses.map((expense) => {
            const isExpanded = expandedId === expense.id;
            const branch = result.branches.find((b) => b.id === expense.branchId);
            const branchName = branch ? branch.name : "All Branches";
            const creator = result.users.find((u) => u.id === expense.createdByUserId);
            const userName = creator ? creator.fullName : "Unknown User";

            return (
              <li
                key={expense.id}
                className="flex flex-col gap-1 rounded-[var(--radius-card)] border border-border px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3 w-full">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : expense.id)}
                    aria-expanded={isExpanded}
                    className="min-w-0 flex-1 text-left select-none"
                  >
                    <p className="truncate text-[length:var(--font-size-body)] font-medium text-on-surface">
                      {expense.category}
                    </p>
                    {expense.note && !isExpanded && (
                      <p className="truncate text-[length:var(--font-size-caption)] text-on-surface-muted">
                        {expense.note}
                      </p>
                    )}
                    <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
                      {new Date(expense.createdAtLocal).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </button>
                  <p className="shrink-0 font-mono text-[length:var(--font-size-body)] font-medium tabular-nums text-on-surface">
                    {formatCurrency(expense.amount)}
                  </p>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDelete(expense.id, expense.category)}
                      aria-label={`Delete ${expense.category} expense`}
                      className="flex h-[var(--touch-target-min)] w-[var(--touch-target-min)] shrink-0 items-center justify-center rounded-full text-danger hover:bg-danger/10 transition-colors"
                    >
                      <Trash2 size={18} aria-hidden />
                    </button>
                  )}
                </div>

                {isExpanded && (
                  <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3 text-[length:var(--font-size-caption)] text-on-surface-muted animate-fade-in">
                    <p>
                      <span className="font-medium text-on-surface">Branch:</span> {branchName}
                    </p>
                    <p>
                      <span className="font-medium text-on-surface">Recorded by:</span> {userName}
                    </p>
                    {expense.note && (
                      <p className="whitespace-pre-wrap">
                        <span className="font-medium text-on-surface">Note:</span> {expense.note}
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <FAB href="/expenses/new" label="Add expense">
        <Plus size={26} aria-hidden />
      </FAB>
    </div>
  );
}
