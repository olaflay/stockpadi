import { useDraft } from "@/hooks/use-draft";
import { toKobo, fromKobo } from "@/lib/kobo";
import type { CartLine } from "@/features/pos/complete-sale";

const CART_DRAFT_KEY = "stockpadi-cart";

/**
 * A product can be in the cart twice — once by its base unit, once by its
 * alt unit (e.g. loose eggs and a tray of eggs) — so the cart is keyed by
 * product + unit, not product alone. See finding 1.1-D in
 * docs/RESEARCH-AND-PLAN.md.
 *
 * Cart state is persisted to sessionStorage so it survives client-side
 * navigation (switching to Products to check stock, then back to Sell).
 * sessionStorage clears automatically when the tab closes, so no stale
 * cart leaks across sessions.
 */
export function cartLineKey(productId: string, unitLabel: string): string {
  return `${productId}__${unitLabel}`;
}

export function useCart() {
  const [cart, setCart, clearCartDraft] = useDraft<Record<string, CartLine>>(
    CART_DRAFT_KEY,
    {}
  );

  function addToCart(productId: string, unitPrice: number, unitLabel: string, conversionFactor: number, qty = 1) {
    const key = cartLineKey(productId, unitLabel);
    setCart((current) => {
      const existing = current[key];
      return {
        ...current,
        [key]: {
          productId,
          unitPrice,
          unitLabel,
          conversionFactor,
          quantity: (existing?.quantity ?? 0) + qty,
        },
      };
    });
  }

  function incrementLine(key: string) {
    setCart((current) => {
      const existing = current[key];
      if (!existing) return current;
      return { ...current, [key]: { ...existing, quantity: existing.quantity + 1 } };
    });
  }

  function decrementLine(key: string) {
    setCart((current) => {
      const existing = current[key];
      if (!existing) return current;
      if (existing.quantity <= 1) {
        const copy = { ...current };
        delete copy[key];
        return copy;
      }
      return { ...current, [key]: { ...existing, quantity: existing.quantity - 1 } };
    });
  }

  function setLineQuantity(key: string, qty: number) {
    setCart((current) => {
      const existing = current[key];
      if (!existing) return current;
      if (qty <= 0) {
        const copy = { ...current };
        delete copy[key];
        return copy;
      }
      return { ...current, [key]: { ...existing, quantity: Math.floor(qty) } };
    });
  }

  function removeLine(key: string) {
    setCart((current) => {
      const copy = { ...current };
      delete copy[key];
      return copy;
    });
  }

  function clearCart() {
    clearCartDraft();
  }

  const cartLines = Object.values(cart);
  const total = fromKobo(
    cartLines.reduce((sumKobo, line) => sumKobo + toKobo(line.unitPrice) * line.quantity, 0)
  );
  const itemCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);

  return { cart, cartLines, total, itemCount, addToCart, incrementLine, decrementLine, setLineQuantity, removeLine, clearCart };
}
