"use client";

import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { hasCapability } from "@/features/auth/authorization";
import { useReportsData } from "@/features/reports/use-reports-data";
import { ReportsBody } from "@/features/reports/components/ReportsBody";

export default function ReportsPage() {
  const user = useCurrentUser();
  const {
    period,
    setPeriod,
    customRange,
    setCustomRange,
    dayOfWeekStats,
    result,
    lowStockProducts,
    periodSales,
    periodExpenses,
    periodExpensesTotal,
    periodPurchases,
    periodPurchasesTotal,
    periodRefunds,
    bestSellers,
    periodNetProfit,
    profitMetrics,
    periodNetCashFlow,
    stockCostValue,
    stockRetailValue,
    stockByProduct,
  } = useReportsData("week");

  if (!hasCapability(user, "VIEW_REPORTS")) {
    return (
      <div>
        <ScreenHeader title="Reports" hideBack={true} />
        <PermissionDenied requiredCapabilities={["VIEW_REPORTS"]} />
      </div>
    );
  }

  if (result == null) {
    return (
      <div>
        <ScreenHeader title="Reports" hideBack={true} />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (result.error) {
    return (
      <div>
        <ScreenHeader title="Reports" hideBack={true} />
        <ErrorState message="Couldn't load your reports." onRetry={() => window.location.reload()} />
      </div>
    );
  }

  return (
    <div className="financial-surfaces flex flex-col gap-6">
      <ScreenHeader title="Reports" hideBack={true} />
      <ReportsBody
        period={period}
        onSelectPeriod={setPeriod}
        customRange={customRange}
        onSelectCustomRange={setCustomRange}
        dayOfWeekStats={dayOfWeekStats}
        periodSales={periodSales}
        periodExpenses={periodExpenses}
        periodExpensesTotal={periodExpensesTotal}
        periodPurchases={periodPurchases}
        periodPurchasesTotal={periodPurchasesTotal}
        periodRefunds={periodRefunds}
        bestSellers={bestSellers}
        lowStockProducts={lowStockProducts}
        periodNetProfit={periodNetProfit}
        profitMetrics={profitMetrics}
        periodNetCashFlow={periodNetCashFlow}
        stockCostValue={stockCostValue}
        stockRetailValue={stockRetailValue}
        stockByProduct={stockByProduct}
      />
    </div>
  );
}
