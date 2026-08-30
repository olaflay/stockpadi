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
import { AddExpenseSheet } from "@/features/expenses/components/AddExpenseSheet";
import { serverGet } from "@/features/operations/server-client";
import { tenantArray } from "@/lib/local-tenant";
import type { LocalBranch, LocalUser } from "@/lib/db";
import type { Expense } from "@/types/expense";

import { getPeriodStartIso, type ReportPeriod } from "@/lib/date";

const CAN_VIEW_EXPENSES = BUSINESS_MANAGEMENT_ACCOUNT_TYPES;
const CAN_DELETE_EXPENSES = BUSINESS_MANAGEMENT_ACCOUNT_TYPES;

type Period = ReportPeriod;
const PERIOD_LABELS: Record<Period, string> = { today: "Today", week: "This week", month: "This month" };

export default function ExpensesPage() {
  const user = useCurrentUser();
  const router = useRouter();
  const { showToast } = useToast();
  const [period, setPeriod] = useState<Period>("today");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);

  const result = useLiveQuery(async () => {
    try {
      const [branches, users] = await Promise.all([tenantArray<LocalBranch>(db.branches), tenantArray<LocalUser>(db.localUsers)]);
      let expenses;
      try {
        const remote = await serverGet<{ expenses: Array<Record<string, unknown>> }>("/api/expenses");
        expenses = remote.expenses.map((expense) => ({
          id: expense.id as string,
          branchId: expense.branch_id as string | null,
          category: expense.category as string,
          amount: Number(expense.amount),
          note: expense.note as string | null,
          createdAtLocal: expense.created_at as string,
          createdByUserId: expense.created_by_user_id as string,
        }));
      } catch {
        expenses = await tenantArray<Expense>(db.expenses.orderBy("createdAtLocal").reverse());
      }
      return { expenses, branches, users, error: false };
    } catch {
      return { expenses: [] as Expense[], branches: [] as LocalBranch[], users: [] as LocalUser[], error: true };
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
          description="Rent, transport, supplies — log what goes out so your profit number is real."
          action={{ label: "Add an expense", onClick: () => setIsAddSheetOpen(true) }}
          fullScreen
        />
        <FAB onClick={() => setIsAddSheetOpen(true)} label="Add expense">
          <Plus size={26} aria-hidden />
        </FAB>
        <AddExpenseSheet isOpen={isAddSheetOpen} onClose={() => setIsAddSheetOpen(false)} />
      </div>
    );
  }

  const periodStart = getPeriodStartIso(period);
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
      </section>

      {periodExpenses.length === 0 ? (
        <p className="py-8 text-center text-[length:var(--font-size-body)] text-on-surface-muted">
          No expenses recorded {PERIOD_LABELS[period].toLowerCase()}.
        </p>
      ) : (
        <ul className="flex flex-col gap-2 pb-24">
          {periodExpenses.map((expense) => {
            const isExpanded = expandedId === expense.id;
            const branchName = result.branches.find((b) => b.id === expense.branchId)?.name ?? "Business-wide";
            const userName = result.users.find((u) => u.id === expense.createdByUserId)?.fullName ?? "You";

            return (
              <li
                key={expense.id}
                className="flex flex-col rounded-[var(--radius-card)] border border-border bg-surface p-4 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : expense.id)}
                    className="flex min-w-0 flex-1 items-center justify-between text-left"
                  >
                    <div>
                      <p className="text-[length:var(--font-size-body-lg)] font-medium text-on-surface">
                        {expense.category}
                      </p>
                      <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
                        {new Date(expense.createdAtLocal).toLocaleDateString("en-NG", {
                          day: "numeric",
                          month: "short",
                        })}
                      </p>
                    </div>
                    <p className="text-[length:var(--font-size-body)] font-semibold tabular-nums text-on-surface">
                      {formatCurrency(expense.amount)}
                    </p>
                  </button>

                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDelete(expense.id, expense.category)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-on-surface-muted hover:bg-danger-container hover:text-on-danger-container transition-colors"
                      aria-label="Delete expense"
                    >
                      <Trash2 size={16} aria-hidden />
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

      <FAB onClick={() => setIsAddSheetOpen(true)} label="Add expense">
        <Plus size={26} aria-hidden />
      </FAB>

      <AddExpenseSheet isOpen={isAddSheetOpen} onClose={() => setIsAddSheetOpen(false)} />
    </div>
  );
}
