"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { db, BUSINESS_PROFILE_SINGLETON_ID } from "@/lib/db";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { useToast } from "@/components/ui/Toast";
import { RippleButton } from "@/components/ui/Ripple";
import { useCurrentUser, hasRole } from "@/features/auth/use-current-user";
import { assertPermission } from "@/features/auth/assert-permission";
import { useOnlineStatus } from "@/lib/use-online-status";
import { OfflineIllustration } from "@/components/illustrations";
import type { Product } from "@/types/product";
import { seedSampleProducts } from "@/features/profile/seed-sample-products";

const CAN_EDIT_PRODUCTS = ["owner", "manager", "inventory_staff", "admin"] as const;

const inputClass =
  "min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[length:var(--font-size-body)] text-on-surface";

/**
 * Onboarding steps 2 and 3 (docs/RESEARCH-AND-PLAN.md Section 4.6): first
 * product, then prove the "works with no network" claim with a real sale.
 * Lives post-auth (see the comment in src/app/onboarding/page.tsx for why),
 * reached from DashboardPage's empty state the first time a signed-in owner
 * has zero products. Never a dead end — Skip goes straight to the normal
 * Products screen.
 */
export default function WelcomePage() {
  const router = useRouter();
  const user = useCurrentUser();
  const { showToast } = useToast();
  const isOnline = useOnlineStatus();

  const [name, setName] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const parsedCost = Number(costPrice);
  const parsedSell = Number(sellPrice);
  const isValid =
    name.trim().length > 0 &&
    costPrice.trim() !== "" &&
    Number.isFinite(parsedCost) &&
    parsedCost >= 0 &&
    sellPrice.trim() !== "" &&
    Number.isFinite(parsedSell) &&
    parsedSell >= 0;

  if (!hasRole(user, [...CAN_EDIT_PRODUCTS])) {
    return (
      <div>
        <ScreenHeader title="First Product" onBack={() => router.push("/dashboard")} />
        <PermissionDenied requiredRoles={[...CAN_EDIT_PRODUCTS]} />
      </div>
    );
  }

  async function handleAddAndSell() {
    if (!isValid) return;
    setIsSubmitting(true);
    try {
      await assertPermission(user, "edit_products");
      const product: Product = {
        id: crypto.randomUUID(),
        sku: `SKU-${Date.now().toString(36).toUpperCase()}`,
        barcode: null,
        name: name.trim(),
        categoryId: null,
        brandId: null,
        unitLabel: "piece",
        altUnitLabel: null,
        altUnitConversionFactor: null,
        altUnitSellPrice: null,
        costPrice: parsedCost,
        sellPrice: parsedSell,
        expiryTracking: "off",
        expiryDate: null,
        lowStockThreshold: null,
        version: 1,
        updatedAt: new Date().toISOString(),
      };
      await db.products.add(product);
      showToast(`${product.name} added, now try selling it`, "success");
      // Deep-links into POS with the product pre-added to cart
      // (src/app/(app)/pos/page.tsx reads ?add=), so the very next thing
      // they do is complete a real sale — with or without a connection.
      router.push(`/pos?add=${product.id}`);
    } catch {
      showToast("Couldn't save that product, try again.", "danger");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLoadSampleData() {
    setIsSubmitting(true);
    try {
      await assertPermission(user, "edit_products");
      const [profile, branch] = await Promise.all([
        db.businessProfile.get(BUSINESS_PROFILE_SINGLETON_ID),
        db.branches.toCollection().first(),
      ]);
      
      if (!profile?.businessTypeId || !branch) {
        showToast("Profile or branch missing.", "danger");
        return;
      }
      
      await seedSampleProducts(profile.businessTypeId, user.id, branch.id);
      showToast("Sample data loaded. Try selling something!", "success");
      router.push("/pos");
    } catch (err) {
      console.error(err);
      showToast("Couldn't load sample data.", "danger");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-24">
      <ScreenHeader title="First Product" onBack={() => router.push("/dashboard")} />

      <div className="flex flex-col items-center gap-3 rounded-[var(--radius-focus-block)] bg-surface-container px-6 py-8 text-center animate-step-in">
        <OfflineIllustration className="mb-1 h-24 w-24 text-brand-accent" />
        <p className="text-[length:var(--font-size-title)] font-semibold text-on-surface">
          Welcome, {user.fullName.split(" ")[0]}
        </p>
        <p className="max-w-sm text-[length:var(--font-size-body)] text-on-surface-muted">
          Add one product, then sell it, right now, {isOnline ? "even with your network turned off" : "you're already offline, so this is the real thing"}.
          {" "}It saves to this phone either way and syncs once you&apos;re back online.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Product name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Indomie Instant Noodles"
            className={inputClass}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[length:var(--font-size-label)] text-on-surface-muted">What you paid</span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              placeholder="0.00"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[length:var(--font-size-label)] text-on-surface-muted">What you sell it for</span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value)}
              placeholder="0.00"
              className={inputClass}
            />
          </label>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-surface border-t border-border z-[100] shadow-[var(--shadow-elevation-sticky-top)]">
        <div className="flex flex-col gap-2">
        <RippleButton
          type="button"
          onClick={handleAddAndSell}
          disabled={!isValid || isSubmitting}
          className="min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] bg-brand-accent px-5 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast disabled:opacity-50 hover:opacity-95 transition-opacity"
        >
          {isSubmitting ? "Saving…" : "Add product & try a sale"}
        </RippleButton>
        <button
          type="button"
          onClick={handleLoadSampleData}
          disabled={isSubmitting}
          className="min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] border border-border bg-surface px-5 text-[length:var(--font-size-body)] font-medium text-brand-accent hover:bg-surface-container disabled:opacity-50 transition-colors"
        >
          Or load sample data for my business type
        </button>
        <button
          type="button"
          onClick={() => router.push("/products")}
          className="min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] px-5 text-[length:var(--font-size-body)] font-medium text-on-surface-muted hover:bg-surface-container transition-colors"
        >
          Skip, I&apos;ll add products myself
        </button>
        </div>
      </div>
    </div>
  );
}
