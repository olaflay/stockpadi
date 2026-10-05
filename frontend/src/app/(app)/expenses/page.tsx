"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Wallet, Trash2, Fuel, Car, Lightbulb, Wrench, Package, Building2 } from "lucide-react";
import { db } from "@/lib/db";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { FilterDropdownBar, type FilterGroup } from "@/components/ui/FilterDropdownBar";
import { MonthGroupHeader } from "@/components/ui/MonthGroupHeader";
import { TransactionItemRow } from "@/components/ui/TransactionItemRow";
import { FAB } from "@/components/ui/FAB";
import { useToast } from "@/components/ui/Toast";
import { getPeriodStartIso, formatTransactionTimestamp, getMonthYearKey, formatMonthYear } from "@/lib/date";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { hasCapability } from "@/features/auth/authorization";
import { deleteExpense } from "@/features/expenses/add-expense";
import { AddExpenseSheet } from "@/features/expenses/components/AddExpenseSheet";
import { tenantArray } from "@/lib/local-tenant";
import type { LocalBranch, LocalUser } from "@/lib/db";
import type { Expense } from "@/types/expense";

type Period = "today" | "week" | "month" | "all_time";

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Fuel: <Fuel size={18} />,
  Transport: <Car size={18} />,
  Utilities: <Lightbulb size={18} />,
  Maintenance: <Wrench size={18} />,
  Packaging: <Package size={18} />,
  Rent: <Building2 size={18} />,
};

export default function ExpensesPage() {
  const user = useCurrentUser();
  const { showToast } = useToast();
  const [period, setPeriod] = useState<Period>("month");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedBranchId, setSelectedBranchId] = useState<string>("all");
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(50);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const result = useLiveQuery(async () => {
    try {
      const periodStart = getPeriodStartIso(period);
      const [branches, users, expenses] = await Promise.all([
        tenantArray<LocalBranch>(db.branches),
        tenantArray<LocalUser>(db.localUsers),
        tenantArray<Expense>(
          db.expenses.where("createdAtLocal").aboveOrEqual(periodStart).reverse()
        ),
      ]);
      return { expenses, branches, users, error: false };
    } catch {
      return { expenses: [] as Expense[], branches: [] as LocalBranch[], users: [] as LocalUser[], error: true };
    }
  }, [period]);

  const rawExpenses = useMemo(() => result?.expenses ?? [], [result?.expenses]);

  // Distinct categories from actual expense data
  const distinctCategories = useMemo(() => {
    const set = new Set<string>();
    for (const e of rawExpenses) {
      if (e.category) set.add(e.category);
    }
    return Array.from(set).sort();
  }, [rawExpenses]);

  // Filtered expenses
  const filteredExpenses = useMemo(() => {
    return rawExpenses.filter((e) => {
      if (selectedCategory !== "all" && e.category !== selectedCategory) return false;
      if (selectedBranchId !== "all" && e.branchId !== selectedBranchId) return false;
      return true;
    });
  }, [rawExpenses, selectedCategory, selectedBranchId]);

  useEffect(() => {
    if (filteredExpenses.length <= visibleLimit) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setVisibleLimit((previous) => previous + 50);
      },
      { threshold: 0.1 }
    );

    const element = loadMoreRef.current;
    if (element) observer.observe(element);
    return () => {
      if (element) observer.unobserve(element);
    };
  }, [filteredExpenses.length, visibleLimit]);

  // Group by month (YYYY-MM)
  const groupedExpenses = useMemo(() => {
    const map = new Map<string, Expense[]>();
    for (const expense of filteredExpenses.slice(0, visibleLimit)) {
      const key = getMonthYearKey(expense.createdAtLocal);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(expense);
    }
    return Array.from(map.entries()).map(([monthKey, expenses]) => {
      const outflow = expenses.reduce((sum, e) => sum + e.amount, 0);
      return {
        monthKey,
        monthName: formatMonthYear(monthKey),
        expenses,
        outflow,
      };
    });
  }, [filteredExpenses, visibleLimit]);

  const canDelete = hasCapability(user, "MANAGE_EXPENSES");

  async function handleDelete(id: string, category: string) {
    if (!confirm(`Delete this ${category} expense? This cannot be undone.`)) return;
    try {
      await deleteExpense(id);
      showToast("Expense deleted", "success");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Couldn't delete expense.",
        "warning"
      );
    }
  }

  const filterGroups: FilterGroup[] = [
    {
      id: "period",
      label: "Date Range",
      options: [
        { value: "today", label: "Today" },
        { value: "week", label: "7 Days" },
        { value: "month", label: "30 Days" },
        { value: "all_time", label: "All Time" },
      ],
      selectedValue: period,
      onChange: (val) => setPeriod(val as Period),
      renderTriggerLabel: (val) => {
        if (val === "today") return "Today";
        if (val === "week") return "7 Days";
        if (val === "month") return "30 Days";
        return "All Dates";
      },
    },
    {
      id: "category",
      label: "All Categories",
      options: [
        { value: "all", label: "All Categories" },
        ...distinctCategories.map((cat) => ({ value: cat, label: cat })),
      ],
      selectedValue: selectedCategory,
      onChange: (val) => setSelectedCategory(val),
    },
    ...(result?.branches && result.branches.length > 1
      ? [
          {
            id: "branch",
            label: "All Branches",
            options: [
              { value: "all", label: "All Branches" },
              ...result.branches.map((b) => ({ value: b.id, label: b.name })),
            ],
            selectedValue: selectedBranchId,
            onChange: (val: string) => setSelectedBranchId(val),
          },
        ]
      : []),
  ];

  if (!hasCapability(user, "MANAGE_EXPENSES")) {
    return (
      <div>
        <ScreenHeader title="Expenses" />
        <PermissionDenied requiredCapabilities={["MANAGE_EXPENSES"]} />
      </div>
    );
  }

  if (result === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <ScreenHeader title="Expenses" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (result.error) {
    return (
      <div>
        <ScreenHeader title="Expenses" />
        <ErrorState message="Couldn't load your expenses." onRetry={() => window.location.reload()} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 pb-12">
      <ScreenHeader title="Expenses" />

      {/* Top Filter Dropdown Bar with Expanding Pill Tray */}
      <FilterDropdownBar filters={filterGroups} ariaLabel="Filter expenses by date and category" />

      {filteredExpenses.length === 0 ? (
        <div className="py-12">
          <EmptyState
            icon={Wallet}
            title="No expenses found"
            description="No expenses matched your selected filters."
            action={{ label: "Add an expense", onClick: () => setIsAddSheetOpen(true) }}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groupedExpenses.map((group) => (
            <section key={group.monthKey} className="flex flex-col gap-2">
              {/* Month Group Header with Outflow and Analysis Action */}
              <MonthGroupHeader
                title={group.monthName}
                outflow={group.outflow}
                analysisHref="/reports"
              />

              {/* Expenses List */}
              <ul className="flex flex-col gap-2">
                {group.expenses.map((expense) => {
                  const branchName = result.branches.find((b) => b.id === expense.branchId)?.name ?? "Branch";
                  const icon = CATEGORY_ICONS[expense.category] || <Wallet size={18} />;

                  return (
                    <li key={expense.id} className="relative group">
                      <TransactionItemRow
                        icon={icon}
                        iconBgClass="bg-rose-500/15 text-rose-400"
                        title={expense.category}
                        subtitle={`${formatTransactionTimestamp(expense.createdAtLocal)} · ${branchName}${
                          expense.note ? ` · ${expense.note}` : ""
                        }`}
                        amount={expense.amount}
                        amountPrefix="−"
                      />
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDelete(expense.id, expense.category)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 sm:opacity-100 p-2 rounded-full text-on-surface-muted hover:text-danger hover:bg-danger/10 transition-all"
                          aria-label={`Delete ${expense.category} expense`}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          {filteredExpenses.length > visibleLimit && (
            <div ref={loadMoreRef} className="py-4 text-center text-xs text-on-surface-muted">
              Loading more expenses...
            </div>
          )}
        </div>
      )}

      <FAB onClick={() => setIsAddSheetOpen(true)} label="Add expense">
        <Plus size={26} aria-hidden />
      </FAB>

      <AddExpenseSheet isOpen={isAddSheetOpen} onClose={() => setIsAddSheetOpen(false)} />
    </div>
  );
}

