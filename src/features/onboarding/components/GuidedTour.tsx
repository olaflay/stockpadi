"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { X, ArrowRight, Check } from "lucide-react";
import { RippleButton } from "@/components/ui/Ripple";

const TOUR_STORAGE_KEY = "stockpadi_tour_step";

interface TourStep {
  step: number;
  pathname: string;
  targetId: string | null;
  title: string;
  description: string;
  actionLabel: string;
}

const TOUR_STEPS: Record<number, TourStep> = {
  1: {
    step: 1,
    pathname: "/dashboard",
    targetId: null,
    title: "Welcome to StockPadi! 🎉",
    description: "Let's take a quick 1-minute interactive tour of your shop. We will show you how to add stock and complete a sale.",
    actionLabel: "Let's Go!",
  },
  2: {
    step: 2,
    pathname: "/products",
    targetId: "tour-add-product",
    title: "Your Product Shelf",
    description: "This is where all your store products are cataloged. Tap 'Add a product' to start adding items.",
    actionLabel: "Add Product",
  },
  3: {
    step: 3,
    pathname: "/products/new",
    targetId: "tour-save-product",
    title: "New Product Details",
    description: "We will auto-fill a sample product ('Crate of Eggs', Cost: ₦1,200, Sell: ₦1,500) so you can quickly see how it works.",
    actionLabel: "Save & Continue",
  },
  4: {
    step: 4,
    pathname: "/products",
    targetId: "tour-nav-sell",
    title: "Product Added! 📦",
    description: "Great! Your product is now on the shelf. Now let's sell it to a customer. Tap 'Sell' in the navigation bar.",
    actionLabel: "Go to Register",
  },
  5: {
    step: 5,
    pathname: "/pos",
    targetId: "tour-pos-item",
    title: "The Cashier Register",
    description: "Select items to add them to the cart. We'll add our 'Crate of Eggs' now.",
    actionLabel: "Add to Cart",
  },
  6: {
    step: 6,
    pathname: "/pos",
    targetId: "tour-pos-cart",
    title: "Review Cart",
    description: "You've added 1 item. Review the cart contents before proceeding to checkout.",
    actionLabel: "Review Cart",
  },
  7: {
    step: 7,
    pathname: "/pos",
    targetId: "tour-pos-checkout",
    title: "Payment & Checkout",
    description: "Select the customer's payment method (Cash, Transfer, etc.) and complete the sale.",
    actionLabel: "Complete Sale",
  },
  8: {
    step: 8,
    pathname: "/sales", // Will match any /sales/[id]
    targetId: null,
    title: "Sale Successful! 🧾",
    description: "You've completed your first sale! The receipt is generated, and stock is automatically deducted from your inventory.",
    actionLabel: "Finish Tour",
  },
};

export function GuidedTour() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useCurrentUser();

  const [step, setStep] = useState<number>(0);
  const [spotlight, setSpotlight] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  // Check if we have products; tour only triggers for brand new owners
  const productsCount = useLiveQuery(() => db.products.count());

  useEffect(() => {
    // Only trigger tour for owner/admin with 0 products
    if (productsCount === 0 && (user.role === "owner" || user.role === "admin")) {
      const storedStep = localStorage.getItem(TOUR_STORAGE_KEY);
      if (!storedStep) {
        // Start tour from step 1
        localStorage.setItem(TOUR_STORAGE_KEY, "1");
        setTimeout(() => setStep(1), 0);
      } else {
        const val = parseInt(storedStep, 10);
        setTimeout(() => setStep(val), 0);
      }
    } else {
      const storedStep = localStorage.getItem(TOUR_STORAGE_KEY);
      if (storedStep) {
        const val = parseInt(storedStep, 10);
        setTimeout(() => setStep(val), 0);
      }
    }
  }, [productsCount, user]);

  // Recalculate spotlight positioning whenever pathname or step changes
  useEffect(() => {
    if (step === 0) {
      setTimeout(() => setSpotlight(null), 0);
      return;
    }

    const currentStepConfig = TOUR_STEPS[step];
    if (!currentStepConfig) return;

    // Handle matching receipt detail route
    if (step === 8 && !pathname.startsWith("/sales/")) {
      return;
    } else if (step !== 8 && currentStepConfig.pathname !== pathname) {
      // If we are out of sync with the page route, redirect to the correct page
      router.push(currentStepConfig.pathname);
      return;
    }

    const targetId = currentStepConfig.targetId;
    if (!targetId) {
      setTimeout(() => setSpotlight(null), 0);
      return;
    }

    // Polling until target element mounts in DOM
    const interval = setInterval(() => {
      const el = document.getElementById(targetId);
      if (el) {
        const rect = el.getBoundingClientRect();
        setSpotlight({
          top: rect.top + window.scrollY,
          left: rect.left + window.scrollX,
          width: rect.width,
          height: rect.height,
        });
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [pathname, step, router]);

  // Update step in state and local storage
  const nextStep = (nextVal: number) => {
    if (nextVal === 0) {
      localStorage.removeItem(TOUR_STORAGE_KEY);
    } else {
      localStorage.setItem(TOUR_STORAGE_KEY, String(nextVal));
    }
    setStep(nextVal);
  };

  const skipTour = () => {
    localStorage.removeItem(TOUR_STORAGE_KEY);
    setStep(0);
  };

  // Automated form values prefiller helper
  const setReactInputValue = (inputEl: HTMLInputElement, val: string) => {
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(inputEl, val);
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const handleNextAction = async () => {
    const currentStepConfig = TOUR_STEPS[step];
    if (!currentStepConfig) return;

    if (step === 1) {
      // Go to Products
      nextStep(2);
      router.push("/products");
    } else if (step === 2) {
      // Action: Navigate to Add Product
      const btn = document.getElementById("tour-add-product");
      if (btn) btn.click();
      nextStep(3);
    } else if (step === 3) {
      // Action: Prefill product fields and save
      const nameInput = document.querySelector('input[placeholder="Product name"]') as HTMLInputElement;
      const costInput = document.querySelector('input[placeholder="Cost price (optional)"]') as HTMLInputElement;
      const sellInput = document.querySelector('input[placeholder="Selling price"]') as HTMLInputElement;

      if (nameInput && sellInput) {
        setReactInputValue(nameInput, "Crate of Eggs");
        if (costInput) setReactInputValue(costInput, "1200");
        setReactInputValue(sellInput, "1500");
      }

      // Add a tiny delay for React state hooks to catch up, then click save
      setTimeout(() => {
        const btn = document.getElementById("tour-save-product");
        if (btn) btn.click();
        nextStep(4);
      }, 100);
    } else if (step === 4) {
      // Action: Navigate to POS Sell
      const btn = document.getElementById("tour-nav-sell");
      if (btn) btn.click();
      nextStep(5);
    } else if (step === 5) {
      // Action: Add product item to cart
      const btn = document.getElementById("tour-pos-item");
      if (btn) btn.click();
      nextStep(6);
    } else if (step === 6) {
      // Action: click Review cart button
      const btn = document.getElementById("tour-pos-cart");
      if (btn) btn.click();
      nextStep(7);
    } else if (step === 7) {
      // Action: complete the checkout
      const btn = document.getElementById("tour-pos-checkout");
      if (btn) btn.click();
      nextStep(8);
    } else if (step === 8) {
      // Action: Tour finished! Back to dashboard
      skipTour();
      router.push("/dashboard");
    }
  };

  if (step === 0) return null;

  const currentStepConfig = TOUR_STEPS[step];
  if (!currentStepConfig) return null;

  // Render spotlight overlay elements
  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      {/* Dark mask overlays around the spotlight */}
      {spotlight && (
        <>
          {/* Top Mask */}
          <div
            className="absolute left-0 right-0 top-0 bg-black/60 transition-all pointer-events-auto"
            style={{ height: spotlight.top }}
          />
          {/* Bottom Mask */}
          <div
            className="absolute left-0 right-0 bottom-0 bg-black/60 transition-all pointer-events-auto"
            style={{ top: spotlight.top + spotlight.height }}
          />
          {/* Left Mask */}
          <div
            className="absolute left-0 bg-black/60 transition-all pointer-events-auto"
            style={{
              top: spotlight.top,
              height: spotlight.height,
              width: spotlight.left,
            }}
          />
          {/* Right Mask */}
          <div
            className="absolute right-0 bg-black/60 transition-all pointer-events-auto"
            style={{
              top: spotlight.top,
              height: spotlight.height,
              left: spotlight.left + spotlight.width,
            }}
          />
          {/* Active Highlight Border Area */}
          <div
            className="absolute border-2 border-brand-accent rounded-lg shadow-[0_0_15px_rgba(var(--color-brand-accent),0.5)] transition-all pointer-events-none animate-pulse"
            style={{
              top: spotlight.top - 2,
              left: spotlight.left - 2,
              width: spotlight.width + 4,
              height: spotlight.height + 4,
            }}
          />
        </>
      )}

      {/* Screen Backdrop for non-spotlight steps (Step 1 and Step 8) */}
      {!spotlight && (
        <div className="absolute inset-0 bg-black/60 pointer-events-auto" />
      )}

      {/* Step Tooltip Card */}
      <div
        className="absolute pointer-events-auto flex w-[90%] max-w-sm flex-col rounded-[var(--radius-card)] bg-surface p-5 shadow-2xl border border-border/80 animate-step-in transition-all"
        style={
          spotlight
            ? {
              top: spotlight.top > window.innerHeight / 2
                ? spotlight.top - 200 // Position above target
                : spotlight.top + spotlight.height + 16, // Position below target
              left: "5%",
              right: "5%",
              margin: "0 auto",
            }
            : {
              top: "30%",
              left: "5%",
              right: "5%",
              margin: "0 auto",
            }
        }
      >
        <div className="flex items-start justify-between gap-4 mb-2">
          <h3 className="text-[length:var(--font-size-body-lg)] font-bold text-on-surface">
            {currentStepConfig.title}
          </h3>
          <button
            onClick={skipTour}
            className="text-on-surface-muted hover:text-on-surface transition-colors"
            title="Skip Tour"
            aria-label="Skip tour"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <p className="text-[length:var(--font-size-body)] text-on-surface-muted leading-relaxed mb-4">
          {currentStepConfig.description}
        </p>

        <div className="flex items-center justify-between gap-4">
          {/* Step Progress indicators */}
          <span className="text-[length:var(--font-size-caption)] text-on-surface-muted">
            Step {step} of 8
          </span>

          <div className="flex gap-2">
            {step < 8 && (
              <button
                type="button"
                onClick={skipTour}
                className="px-3 py-1.5 rounded-[var(--radius-control)] text-[length:var(--font-size-caption)] font-medium text-on-surface-muted hover:text-on-surface hover:bg-surface-container transition-colors"
              >
                Skip
              </button>
            )}
            <RippleButton
              type="button"
              onClick={handleNextAction}
              className="flex items-center gap-1.5 px-4 py-2 rounded-[var(--radius-control)] bg-brand-accent text-[length:var(--font-size-body)] font-semibold text-brand-accent-contrast shadow-sm hover:opacity-95"
            >
              {currentStepConfig.actionLabel}
              {step === 8 ? <Check size={16} /> : <ArrowRight size={16} />}
            </RippleButton>
          </div>
        </div>
      </div>
    </div>
  );
}
