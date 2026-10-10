"use client";

import { useState, useEffect, Suspense, useMemo, useDeferredValue } from "react";
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
import { SelectInput } from "@/components/ui/SelectInput";
import { useToast } from "@/components/ui/Toast";
import { useNavigation } from "@/components/ui/NavigationContext";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { hasCapability } from "@/features/auth/authorization";
import { completeSale } from "@/features/pos/complete-sale";
import { resolveStockStatus, LOW_STOCK_THRESHOLD } from "@/features/inventory/product-insights";
import { useCart } from "@/features/pos/use-cart";
import { parsePosQuery } from "@/lib/parse-pos-query";
import { useSplitPayment, AMOUNT_EPSILON } from "@/features/pos/use-split-payment";
import { BrowseStep } from "@/features/pos/components/BrowseStep";
import { CheckoutContainer } from "@/features/pos/components/CheckoutContainer";
import { ParkedSalesModal } from "@/features/pos/components/ParkedSalesModal";
import {
  getParkedSales,
  parkSale,
  resumeParkedSale,
  deleteParkedSale,
  type ParkedSale,
} from "@/features/pos/parked-sales";
import { formatCurrency } from "@/lib/format";
import { useOnlineStatus } from "@/lib/use-online-status";
import { tenantArray } from "@/lib/local-tenant";
import { getCurrentStock } from "@/features/inventory/stock";
import { resolveDefaultBranch } from "@/features/branches/resolve-default-branch";
import { searchProductsFuzzy } from "@/lib/fuzzy-search";
import { getBestSellingProductIds, getStockByProduct } from "@/features/inventory/product-insights";
import { feedbackSaleComplete } from "@/lib/feedback";

function PosPageContent() {
  const user = useCurrentUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const addProductId = searchParams.get("add");
  const isOnline = useOnlineStatus();
  const { showToast } = useToast();
  const [step, setStep] = useState<"browse" | "cart" | "payment">("browse");
  const { setOverrideHidden } = useNavigation();

  useEffect(() => {
    if (step === "cart" || step === "payment") {
      setOverrideHidden(true);
      return () => setOverrideHidden(false);
    } else {
      setOverrideHidden(false);
    }
  }, [step, setOverrideHidden]);

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 80);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showParkedSales, setShowParkedSales] = useState(false);

  const cart = useCart();
  const payment = useSplitPayment(cart.total);
  const [parkedSales, setParkedSales] = useState<ParkedSale[]>(() => getParkedSales(user.businessId));

  useEffect(() => {
    const refreshTimer = window.setTimeout(() => {
      setParkedSales(getParkedSales(user.businessId));
      setShowParkedSales(false);
    }, 0);
    return () => window.clearTimeout(refreshTimer);
  }, [user.businessId]);

  function handleParkSale() {
    try {
      parkSale({
        businessId: user.businessId,
        lines: cart.cartLines,
        discount: cart.discount,
        customerId: payment.hasCreditLine ? payment.creditCustomerId : null,
      });
      setParkedSales(getParkedSales(user.businessId));
      cart.clearCart();
      setStep("browse");
      showToast("Cart held. Ready for next customer.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not hold cart", "warning");
    }
  }

  function handleResumeParkedSale(id: string) {
    const resumed = resumeParkedSale(id, user.businessId);
    if (resumed) {
      cart.loadCart(resumed.lines, resumed.discount);
      if (resumed.customerId) {
        payment.setCreditCustomerId(resumed.customerId);
      }
      setParkedSales(getParkedSales(user.businessId));
      showToast("Held cart restored to till.", "success");
    }
  }

  function handleDeleteParkedSale(id: string) {
    deleteParkedSale(id, user.businessId);
    setParkedSales(getParkedSales(user.businessId));
    showToast("Held cart discarded.", "neutral");
  }

  const parkedSalesModal = (
    <ParkedSalesModal
      isOpen={showParkedSales}
      onClose={() => setShowParkedSales(false)}
      parkedSales={parkedSales}
      onResume={handleResumeParkedSale}
      onDelete={handleDeleteParkedSale}
    />
  );

  const branches = useLiveQuery(() => tenantArray<LocalBranch>(db.branches), [], []);
  const categories = useLiveQuery(() => tenantArray<LocalCategory>(db.categories), [], []);
  const customers = useLiveQuery(() => tenantArray<LocalCustomer>(db.customers), [], []);
  const accessibleBranches = branches.filter(
    (branch) => branch.isActive !== false && (user.accountType !== "WORKER" || user.branchIds?.includes(branch.id))
  );
  const activeBranchId =
    (selectedBranchId && accessibleBranches.some((branch) => branch.id === selectedBranchId) ? selectedBranchId : null) ??
    resolveDefaultBranch(accessibleBranches, user);

  const stockByProduct = useLiveQuery(async () => {
    if (!activeBranchId) return undefined;
    return Object.fromEntries((await getStockByProduct(activeBranchId)).entries());
  }, [activeBranchId]);

  const result = useLiveQuery(async () => {
    try {
      const products = await tenantArray<Product>(db.products.orderBy("name"));
      return { products, error: null as string | null };
    } catch (err) {
      return { products: [], error: err instanceof Error ? err.message : "Could not load products." };
    }
  }, []);

  // Top sellers over the last 30 days, ranked by unit volume. Insertion order
  // of the returned Set is the rank order — see getBestSellingProductIds.
  const bestSellerIds = useLiveQuery(() => getBestSellingProductIds(10), [], new Set<string>());

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

  // Strip the optional quantity prefix (e.g. "5 sugar" → search "sugar")
  // using deferred value to keep checkout/cart steppers at 60fps
  const deferredQuery = useDeferredValue(debouncedQuery);
  const { term: filterTerm } = useMemo(() => parsePosQuery(deferredQuery), [deferredQuery]);

  const rawProducts = result?.products;
  const availableProducts = useMemo(() => {
    if (!rawProducts) return [];
    return rawProducts.filter((product) => {
      if (product.archived) return false;
      if (selectedCategoryId !== null && product.categoryId !== selectedCategoryId) return false;
      return true;
    });
  }, [rawProducts, selectedCategoryId]);

  const filtered = useMemo(() => {
    const { exact, suggestions } = searchProductsFuzzy(availableProducts, filterTerm);
    return [...exact, ...suggestions];
  }, [availableProducts, filterTerm]);

  if (!hasCapability(user, "POS_SELL")) {
    return (
      <div>
        <ScreenHeader title="Sell" hideBack={true} />
        <PermissionDenied requiredCapabilities={["POS_SELL"]} />
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
      <div className="flex flex-col flex-1 h-full min-h-0 justify-between">
        <ScreenHeader title="Sell" hideBack={true} />
        <EmptyState
          icon={ShoppingBag}
          title="Nothing to sell yet"
          description="Add products first, then come back here to start checking out sales."
          action={{ label: "Add a product", onClick: () => router.push("/products/new") }}
        />
      </div>
    );
  }

  async function handleCompleteSale() {
    if (cart.cartLines.length === 0) return;
    const branchId = activeBranchId;
    if (!branchId && user.accountType !== "WORKER") {
      showToast("No primary branch is available. Ask the owner to configure one.", "warning");
      return;
    }
    if (!branchId) {
      showToast(
        user.accountType === "WORKER"
          ? "No branch assigned to this account. Ask your shop owner to assign one."
          : "Could not resolve store branch.",
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
    const soldLines = [...cart.cartLines];

    // The save is isolated in its own try/catch on purpose. It used to share
    // one block with the low-stock advisory below, so any failure in that
    // advisory — a stock read, a lookup — reported "Couldn't save the sale"
    // for a sale that had already been committed and cleared from the cart.
    // A cashier would retry a sale that had in fact gone through.
    let savedSaleId: string;
    try {
      const sale = await completeSale({
        branchId,
        customerId: payment.hasCreditLine ? payment.creditCustomerId : null,
        payments: payment.effectivePayments,
        lines: cart.cartLines,
        discount: cart.discount,
        createdByUserId: user.id,
        actor: user,
      });
      savedSaleId = sale.id;
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
      setIsSubmitting(false);
      return;
    }

    feedbackSaleComplete();
    // Tappable but non-blocking: a cashier mid-queue keeps selling, but the
    // receipt this sale produced is never just a toast that vanishes in 3
    // seconds. See finding 3.1/#4 in docs/RESEARCH-AND-PLAN.md.
    showToast(`Sale completed: ${formatCurrency(cart.total)} · Tap to view receipt`, "success", () =>
      router.push(`/sales/${savedSaleId}`)
    );
    cart.clearCart();
    payment.reset();
    setStep("browse");
    setIsSubmitting(false);

    // Advisory only. The sale is already saved and the cart already cleared,
    // so a failure here is swallowed rather than surfaced as a save failure.
    try {
      const uniqueProductIds = Array.from(new Set(soldLines.map((l) => l.productId)));
      for (const pid of uniqueProductIds) {
        const remaining = await getCurrentStock(pid, branchId);
        const prod = result?.products.find((p) => p.id === pid);
        const status = resolveStockStatus(remaining, prod?.lowStockThreshold ?? LOW_STOCK_THRESHOLD);
        if (status === "out" || status === "low") {
          const prodName = prod?.name ?? "An item";
          setTimeout(() => {
            showToast(
              `Low stock: "${prodName}" is down to ${remaining} left.`,
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
      console.warn("Sale saved, but the low-stock advisory could not run:", err);
    }
  }

  if (step === "cart" || step === "payment") {
    return (
      <>
        <CheckoutContainer
        cartLines={cart.cartLines}
        products={result.products}
        itemCount={cart.itemCount}
        subtotal={cart.subtotal}
        discount={cart.discount}
        total={cart.total}
        onSetDiscount={cart.setDiscount}
        onParkSale={handleParkSale}
        onBackToBrowse={() => setStep("browse")}
        onClearCart={() => {
          cart.clearCart();
          setStep("browse");
        }}
        onIncrement={cart.incrementLine}
        onDecrement={cart.decrementLine}
        onSetQuantity={cart.setLineQuantity}
        onRemoveLine={cart.removeLine}
        stockByProduct={stockByProduct}
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
        onCompleteSale={handleCompleteSale}
        initialTab={step}
        />
        {parkedSalesModal}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {accessibleBranches.length > 1 && (
        <div>
          <label htmlFor="pos-active-branch" className="mb-1.5 block text-[length:var(--font-size-caption)] font-medium text-on-surface-muted">
            Selling from
          </label>
          <SelectInput
            id="pos-active-branch"
            value={activeBranchId ?? ""}
            onChange={(event) => setSelectedBranchId(event.target.value || null)}
            aria-label="Selling from branch"
          >
            {accessibleBranches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </SelectInput>
        </div>
      )}
      <BrowseStep
        query={query}
        onQueryChange={setQuery}
        categories={categories}
        selectedCategoryId={selectedCategoryId}
        onSelectCategory={setSelectedCategoryId}
        filteredProducts={filtered}
        allProducts={result.products}
        bestSellerIds={bestSellerIds}
        cart={cart.cart}
        onAddToCart={cart.addToCart}
        onIncrementLine={cart.incrementLine}
        onDecrementLine={cart.decrementLine}
        itemCount={cart.itemCount}
        total={cart.total}
        onReviewCart={() => setStep("cart")}
        parkedSalesCount={parkedSales.length}
        onOpenParkedSales={() => setShowParkedSales(true)}
        onGoToSettings={() => router.push("/settings/branches")}
        stockByProduct={stockByProduct}
      />
      {parkedSalesModal}
    </div>
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
