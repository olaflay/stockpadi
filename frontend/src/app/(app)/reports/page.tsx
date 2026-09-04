"use client";

import { useRouter } from "next/navigation";
import { EmptySalesIllustration } from "@/components/illustrations";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { useReportsData } from "@/features/reports/use-reports-data";
import { ReportsBody } from "@/features/reports/components/ReportsBody";

export default function ReportsPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const {
    period,
    setPeriod,
    result,
    lowStockProducts,
    periodSales,
    periodExpenses,
    periodExpensesTotal,
    periodPurchases,
    periodPurchasesTotal,
    bestSellers,
    periodGrossProfit,
    periodNetProfit,
    periodNetCashFlow,
  } = useReportsData();

  if (user.accountType !== "BUSINESS_OWNER" && user.accountType !== "ADMIN") {
    return (
      <div>
        <ScreenHeader title="Reports" hideBack={true} />
        <PermissionDenied requiredAccountTypes={["ADMIN", "BUSINESS_OWNER"]} />
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

  if (result.sales.length === 0) {
    return (
      <div className="flex flex-col flex-1 h-full min-h-[calc(100dvh-10rem)]">
        <ScreenHeader title="Reports" hideBack={true} />
        <div className="flex flex-1 items-center justify-center my-auto">
          <EmptyState
            illustration={EmptySalesIllustration}
            title="No sales yet"
            description="Reports fill in once the first sale is recorded on any branch."
            action={{ label: "Go to Sell", onClick: () => router.push("/pos") }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title="Reports" hideBack={true} />
      <ReportsBody
        period={period}
        onSelectPeriod={setPeriod}
        periodSales={periodSales}
        periodExpenses={periodExpenses}
        periodExpensesTotal={periodExpensesTotal}
        periodPurchases={periodPurchases}
        periodPurchasesTotal={periodPurchasesTotal}
        bestSellers={bestSellers}
        lowStockProducts={lowStockProducts}
        periodGrossProfit={periodGrossProfit}
        periodNetProfit={periodNetProfit}
        periodNetCashFlow={periodNetCashFlow}
      />
    </div>
  );
}
