"use client";

import { useState, useRef } from "react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { M3SegmentedButton } from "@/components/ui/M3SegmentedButton";
import { CartStep } from "@/features/pos/components/CartStep";
import { PaymentStep } from "@/features/pos/components/PaymentStep";
import { formatCurrency } from "@/lib/format";
import type { CartLine } from "@/features/pos/complete-sale";
import type { ParkedSale } from "@/features/pos/parked-sales";
import type { Product } from "@/types/product";
import type { LocalCustomer } from "@/lib/db";
import type { PaymentMethod, SalePayment } from "@/types/sale";

export interface CheckoutContainerProps {
  // Cart props
  cartLines: CartLine[];
  products: Product[];
  itemCount: number;
  subtotal: number;
  discount: number;
  total: number;
  onClearCart: () => void;
  onIncrement: (key: string) => void;
  onDecrement: (key: string) => void;
  onSetQuantity?: (key: string, qty: number) => void;
  onRemoveLine?: (key: string) => void;
  onSetDiscount?: (amount: number) => void;
  parkedSales?: ParkedSale[];
  onParkSale?: () => void;
  onResumeParkedSale?: (id: string) => void;
  onDeleteParkedSale?: (id: string) => void;
  stockByProduct?: Record<string, number>;

  // Payment props
  effectivePayments: SalePayment[];
  remaining: number;
  hasCreditLine: boolean;
  creditAmount: number;
  customers: LocalCustomer[] | undefined;
  creditCustomerId: string | null;
  onSelectCreditCustomer: (id: string | null) => void;
  onUpdatePaymentMethod: (index: number, method: PaymentMethod) => void;
  onUpdatePaymentAmount: (index: number, amount: number) => void;
  onUpdatePaymentTendered: (index: number, tendered: number) => void;
  onUpdatePaymentNote: (index: number, note: string) => void;
  onAddPaymentLine: () => void;
  onRemovePaymentLine: (index: number) => void;
  isSubmitting: boolean;
  isOnline: boolean;
  onCompleteSale: () => void;

  // Navigation
  onBackToBrowse: () => void;
  initialTab?: "cart" | "payment";
}

/**
 * Combined Horizontally-Segmented & Touch-Swipeable Cart & Checkout Container.
 *
 * M3 Compliant:
 * - Top text-only Segmented Button: [ Cart (X) | Payment (₦Y) ]
 * - Smooth horizontal sliding panes between Cart & Payment.
 * - Touch swipe gesture detection (swipe left for payment, swipe right for cart).
 * - Reliable Back button: Payment -> Cart -> Browse.
 */
export function CheckoutContainer(props: {
  cartLines: CartLine[];
  products: Product[];
  itemCount: number;
  subtotal: number;
  discount: number;
  total: number;
  onClearCart: () => void;
  onIncrement: (key: string) => void;
  onDecrement: (key: string) => void;
  onSetQuantity?: (key: string, qty: number) => void;
  onRemoveLine?: (key: string) => void;
  onSetDiscount?: (amount: number) => void;
  parkedSales?: ParkedSale[];
  onParkSale?: () => void;
  onResumeParkedSale?: (id: string) => void;
  onDeleteParkedSale?: (id: string) => void;
  stockByProduct?: Record<string, number>;
  effectivePayments: SalePayment[];
  remaining: number;
  hasCreditLine: boolean;
  creditAmount: number;
  customers: LocalCustomer[] | undefined;
  creditCustomerId: string | null;
  onSelectCreditCustomer: (id: string | null) => void;
  onUpdatePaymentMethod: (index: number, method: PaymentMethod) => void;
  onUpdatePaymentAmount: (index: number, amount: number) => void;
  onUpdatePaymentTendered: (index: number, tendered: number) => void;
  onUpdatePaymentNote: (index: number, note: string) => void;
  onAddPaymentLine: () => void;
  onRemovePaymentLine: (index: number) => void;
  isSubmitting: boolean;
  isOnline: boolean;
  onCompleteSale: () => void;
  onBackToBrowse: () => void;
  initialTab?: "cart" | "payment";
}) {
  const [activeTab, setActiveTab] = useState<"cart" | "payment">(props.initialTab || "cart");
  const [prevInitialTab, setPrevInitialTab] = useState(props.initialTab);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  // Sync initial tab when changed externally during render (React recommended pattern)
  if (props.initialTab !== prevInitialTab) {
    setPrevInitialTab(props.initialTab);
    if (props.initialTab) {
      setActiveTab(props.initialTab);
    }
  }

  function handleBack() {
    if (activeTab === "payment") {
      setActiveTab("cart");
    } else {
      props.onBackToBrowse();
    }
  }

  // Touch swipe gesture handlers
  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;

    // Only register horizontal swipe if horizontal distance is significantly larger than vertical scroll
    if (Math.abs(deltaX) > 55 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX < 0 && activeTab === "cart" && props.itemCount > 0) {
        // Swipe left -> go to Payment
        setActiveTab("payment");
      } else if (deltaX > 0 && activeTab === "payment") {
        // Swipe right -> go back to Cart
        setActiveTab("cart");
      }
    }
    touchStartX.current = null;
    touchStartY.current = null;
  }

  const segmentOptions = [
    { value: "cart", label: `Cart (${props.itemCount})` },
    { value: "payment", label: `Payment (${formatCurrency(props.total)})` },
  ];

  return (
    <div
      className="flex h-full min-h-0 min-w-0 w-full max-w-full flex-col gap-3 animate-step-in"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Reliable Header with Back Button */}
      <ScreenHeader
        title={activeTab === "cart" ? "Review Cart" : "Payment & Tender"}
        onBack={handleBack}
      />

      {/* Top Segmented Control Track (No Icons, Text-Only) */}
      <div className="px-0.5">
        <M3SegmentedButton
          type="single"
          options={segmentOptions}
          value={activeTab}
          onChange={(val) => setActiveTab(val as "cart" | "payment")}
          size="default"
          ariaLabel="Checkout step tabs"
        />
      </div>

      {/* Horizontally-Segmented Carousel Panes */}
      <div className="relative min-h-0 min-w-0 flex-1 w-full max-w-full overflow-hidden">
        <div
          className={`flex h-full w-[200%] max-w-none min-w-0 transition-transform duration-300 ease-out will-change-transform ${
            activeTab === "cart" ? "translate-x-0" : "-translate-x-1/2"
          }`}
        >
          {/* Left Pane: Cart */}
          <div className="h-full w-1/2 min-w-0 shrink-0 pr-1 overflow-y-auto">
            <CartStep
              cartLines={props.cartLines}
              products={props.products}
              itemCount={props.itemCount}
              subtotal={props.subtotal}
              discount={props.discount}
              total={props.total}
              onBack={props.onBackToBrowse}
              onClearCart={props.onClearCart}
              onIncrement={props.onIncrement}
              onDecrement={props.onDecrement}
              onSetQuantity={props.onSetQuantity}
              onRemoveLine={props.onRemoveLine}
              onSetDiscount={props.onSetDiscount}
              parkedSales={props.parkedSales}
              onParkSale={props.onParkSale}
              onResumeParkedSale={props.onResumeParkedSale}
              onDeleteParkedSale={props.onDeleteParkedSale}
              onContinueToPayment={() => setActiveTab("payment")}
              stockByProduct={props.stockByProduct}
              hideHeader={true}
            />
          </div>

          {/* Right Pane: Payment */}
          <div className="h-full w-1/2 min-w-0 shrink-0 pl-1 overflow-y-auto">
            <PaymentStep
              itemCount={props.itemCount}
              subtotal={props.subtotal}
              discount={props.discount}
              total={props.total}
              effectivePayments={props.effectivePayments}
              remaining={props.remaining}
              hasCreditLine={props.hasCreditLine}
              creditAmount={props.creditAmount}
              customers={props.customers}
              creditCustomerId={props.creditCustomerId}
              onSelectCreditCustomer={props.onSelectCreditCustomer}
              onUpdatePaymentMethod={props.onUpdatePaymentMethod}
              onUpdatePaymentAmount={props.onUpdatePaymentAmount}
              onUpdatePaymentTendered={props.onUpdatePaymentTendered}
              onUpdatePaymentNote={props.onUpdatePaymentNote}
              onAddPaymentLine={props.onAddPaymentLine}
              onRemovePaymentLine={props.onRemovePaymentLine}
              isSubmitting={props.isSubmitting}
              isOnline={props.isOnline}
              onBack={() => setActiveTab("cart")}
              onCompleteSale={props.onCompleteSale}
              hideHeader={true}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
