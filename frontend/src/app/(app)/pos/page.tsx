"use client";

import { useState, useEffect, Suspense } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ShoppingBag } from "lucide-react";
import { db, type LocalBranch, type LocalCategory, type LocalCustomer } from "@/lib/db";
import type { Product } from "@/types/product";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { useToast } from "@/components/ui/Toast";
import { useCurrentUser, hasAccountType } from "@/features/auth/use-current-user";
import { WORKER_EXPERIENCE_ACCOUNT_TYPES } from "@/features/auth/authorization";
import { completeSale } from "@/features/pos/complete-sale";
import { useCart } from "@/features/pos/use-cart";
import { parsePosQuery } from "@/lib/parse-pos-query";
import { useSplitPayment, AMOUNT_EPSILON } from "@/features/pos/use-split-payment";
import { BrowseStep } from "@/features/pos/components/BrowseStep";
import { CartStep } from "@/features/pos/components/CartStep";
import { PaymentStep } from "@/features/pos/components/PaymentStep";
import { formatCurrency } from "@/lib/format";
import { useOnlineStatus } from "@/lib/use-online-status";
import { tenantArray } from "@/lib/local-tenant";
import type { StockMovement } from "@/types/stock-movement";
import { getCurrentStock } from "@/features/inventory/stock";
import { resolveDefaultBranch } from "@/features/branches/resolve-default-branch";
import { searchProductsFuzzy } from "@/lib/fuzzy-search";
import { feedbackSaleComplete } from "@/lib/feedback";

function PosPageContent() {
  const user = useCurrentUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const addProductId = searchParams.get("add");
  const isOnline = useOnlineStatus();
  const { showToast } = useToast();
  const [step, setStep] = useState<"browse" | "cart" | "payment">("browse");
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 80);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const cart = useCart();
  const payment = useSplitPayment(cart.total);

  const branches = useLiveQuery(() => tenantArray<LocalBranch>(db.branches), [], []);
  const categories = useLiveQuery(() => tenantArray<LocalCategory>(db.categories), [], []);
  const customers = useLiveQuery(() => tenantArray<LocalCustomer>(db.customers), [], []);

  const stockByProduct = useLiveQuery(async () => {
    const branchId = resolveDefaultBranch(branches, user);
    if (!branchId) return {};
    const movements = await tenantArray<StockMovement>(
      db.stockMovements.where("branchId").equals(branchId)
    );
    const map: Record<string, number> = {};
    for (const m of movements) {
      map[m.productId] = (map[m.productId] ?? 0) + m.quantityDelta;
    }
    return map;
  }, [branches], {});

  const result = useLiveQuery(async () => {
    try {
      const products = await tenantArray<Product>(db.products.orderBy("name"));
      return { products, error: null as string | null };
    } catch (err) {
      return { products: [], error: err instanceof Error ? err.message : "Could not load products." };
    }
  }, []);

  useEffect(() => {
    if (addProductId && result?.products && result.products.length > 0) {
      const prod = result.products.find((p) => p.id === addProductId);
      if (prod) {
        // Genuine one-time sync of external URL state (?add=) into local
        // cart state, not a derived-value calculation — the case effects
        // are for. router.replace immediately below removes the param so
        // this doesn't re-fire.
        cart.addToCart(prod.id, prod.sellPrice, prod.unitLabel, 1);
        setTimeout(() => setStep("cart"), 0);
        // Remove search param from URL to prevent duplicate adds on reload
        router.replace("/pos");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addProductId, result, router]);

  if (!hasAccountType(user, WORKER_EXPERIENCE_ACCOUNT_TYPES)) {
    return (
      <div>
        <ScreenHeader title="Sell" hideBack={true} />
        <PermissionDenied requiredAccountTypes={WORKER_EXPERIENCE_ACCOUNT_TYPES} />
      </div>
    );
  }

  if (result === undefined) {
    return (
      <div>
        <ScreenHeader title="Sell" hideBack={true} />
        <Skeleton className="h-12" />
      </div>
    );
  }

  if (result.error) {
    return (
      <div>
        <ScreenHeader title="Sell" hideBack={true} />
        <ErrorState message="Couldn't load products for checkout." onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (result.products.length === 0) {
    return (
      <div className="flex flex-col h-screen">
        <ScreenHeader title="Sell" hideBack={true} />
        <EmptyState
          icon={ShoppingBag}
          title="Nothing to sell yet"
          description="Add products first, then come back here to start checking out sales."
          action={{ label: "Add a product", onClick: () => router.push("/products/new") }}
          fullScreen
        />
      </div>
    );
  }

  // Strip the optional quantity prefix (e.g. "5 sugar" → search "sugar")
  // so the product list shows correct results regardless of how the cashier
  // prefixes their quantity. parsePosQuery is zero-cost when no prefix.
  const { term: filterTerm } = parsePosQuery(debouncedQuery);

  const availableProducts = result.products.filter((product) => {
    if (product.archived) return false;
    if (selectedCategoryId !== null && product.categoryId !== selectedCategoryId) return false;
    return true;
  });

  const { exact, suggestions } = searchProductsFuzzy(availableProducts, filterTerm);
  const filtered = [...exact, ...suggestions];

  const hasNoBranches = branches !== undefined && branches.length === 0;

  async function handleCompleteSale() {
    if (cart.cartLines.length === 0) return;
    const branchId = resolveDefaultBranch(branches, user);
    if (!branchId) {
      showToast(
        user.accountType === "WORKER"
          ? "No branch is assigned to this account — ask your owner to assign one."
          : "Set up a branch in Settings before selling.",
        "warning"
      );
      return;
    }
    if (Math.abs(payment.remaining) > AMOUNT_EPSILON) {
      showToast("Payments don't add up to the total yet.", "warning");
      return;
    }
    if (payment.hasCreditLine && !payment.creditCustomerId) {
      showToast("Choose who this credit sale is owed by first.", "warning");
      return;
    }

    setIsSubmitting(true);
    try {
      const soldLines = [...cart.cartLines];
      const sale = await completeSale({
        branchId,
        customerId: payment.hasCreditLine ? payment.creditCustomerId : null,
        payments: payment.effectivePayments,
        lines: cart.cartLines,
        createdByUserId: user.id,
        actor: user,
      });

      feedbackSaleComplete();
      // Tappable but non-blocking: a cashier mid-queue keeps selling, but the
      // receipt this sale produced is never just a toast that vanishes in 3
      // seconds. See finding 3.1/#4 in docs/RESEARCH-AND-PLAN.md.
      showToast(`Sale completed: ${formatCurrency(cart.total)} · Tap to view receipt`, "success", () =>
        router.push(`/sales/${sale.id}`)
      );
      cart.clearCart();
      payment.reset();
      setStep("browse");

      // Check remaining stock for products sold to trigger low-stock alert if applicable
      const uniqueProductIds = Array.from(new Set(soldLines.map((l) => l.productId)));
      for (const pid of uniqueProductIds) {
        const remaining = await getCurrentStock(pid, branchId);
        const prod = result?.products.find((p) => p.id === pid);
        const threshold = prod?.lowStockThreshold ?? 5;
        if (remaining <= threshold) {
          const prodName = prod?.name ?? "An item";
          setTimeout(() => {
            showToast(
              `⚠️ Low stock alert: "${prodName}" is down to ${remaining} left.`,
              "warning",
              {
                label: "Restock",
                onClick: () => router.push("/purchases/new"),
              }
            );
          }, 350);
          break; // Surface the most urgent item
        }
      }
    } catch (err) {
      console.error("Failed to complete sale:", err);
      const message =
        err instanceof Error
          ? err.message
          : "Couldn't save the sale. It's still in your cart, try again.";
      const isStockError = message.toLowerCase().includes("stock");
      showToast(
        message,
        "danger",
        isStockError
          ? {
              label: "Restock",
              onClick: () => router.push("/purchases/new"),
            }
          : undefined
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (step === "cart") {
    return (
      <CartStep
        cartLines={cart.cartLines}
        products={result.products}
        itemCount={cart.itemCount}
        total={cart.total}
        onBack={() => setStep("browse")}
        onClearCart={() => {
          cart.clearCart();
          setStep("browse");
        }}
        onIncrement={cart.incrementLine}
        onDecrement={cart.decrementLine}
        onSetQuantity={cart.setLineQuantity}
        onRemoveLine={cart.removeLine}
        onContinueToPayment={() => setStep("payment")}
        stockByProduct={stockByProduct}
      />
    );
  }

  if (step === "payment") {
    return (
      <PaymentStep
        itemCount={cart.itemCount}
        total={cart.total}
        effectivePayments={payment.effectivePayments}
        remaining={payment.remaining}
        hasCreditLine={payment.hasCreditLine}
        creditAmount={payment.creditAmount}
        customers={customers}
        creditCustomerId={payment.creditCustomerId}
        onSelectCreditCustomer={payment.setCreditCustomerId}
        onUpdatePaymentMethod={payment.updatePaymentMethod}
        onUpdatePaymentAmount={payment.updatePaymentAmount}
        onUpdatePaymentTendered={payment.updatePaymentTendered}
        onUpdatePaymentNote={payment.updatePaymentNote}
        onAddPaymentLine={payment.addPaymentLine}
        onRemovePaymentLine={payment.removePaymentLine}
        isSubmitting={isSubmitting}
        isOnline={isOnline}
        onBack={() => setStep("cart")}
        onCompleteSale={handleCompleteSale}
      />
    );
  }

  return (
    <BrowseStep
      hasNoBranches={hasNoBranches}
      query={query}
      onQueryChange={setQuery}
      categories={categories}
      selectedCategoryId={selectedCategoryId}
      onSelectCategory={setSelectedCategoryId}
      filteredProducts={filtered}
      allProducts={result.products}
      cart={cart.cart}
      onAddToCart={cart.addToCart}
      onIncrementLine={cart.incrementLine}
      onDecrementLine={cart.decrementLine}
      itemCount={cart.itemCount}
      total={cart.total}
      onReviewCart={() => setStep("cart")}
      onGoToSettings={() => router.push("/settings")}
      stockByProduct={stockByProduct}
    />
  );
}

export default function PosPage() {
  return (
    <Suspense
      fallback={
        <div>
          <ScreenHeader title="Sell" hideBack={true} />
          <Skeleton className="h-12" />
        </div>
      }
    >
      <PosPageContent />
    </Suspense>
  );
}
