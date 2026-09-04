"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { parseRestockQuantity, parseUnitCost } from "@/features/purchases/restock-parse";
import type { Product } from "@/types/product";
import type { PurchaseLine } from "@/features/purchases/receive-purchase";

const inputClass =
  "min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[length:var(--font-size-body)] text-on-surface focus-visible:outline-none focus-visible:border-brand-accent focus-visible:ring-1 focus-visible:ring-brand-accent";

const stepperClass =
  "flex h-[var(--touch-target-min)] w-[var(--touch-target-min)] shrink-0 items-center justify-center rounded-full border border-border bg-surface font-semibold text-[length:var(--font-size-title)] text-on-surface hover:bg-surface-container-high transition-colors";

const stepperDisabledClass =
  "border-border/40 bg-surface-container text-on-surface-muted opacity-40 cursor-not-allowed";

function sanitizeQuantity(raw: string): string {
  return raw.replace(/[^\d]/g, "").slice(0, 7);
}

function sanitizeCost(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const firstDot = cleaned.indexOf(".");
  const normalized =
    firstDot === -1
      ? cleaned
      : `${cleaned.slice(0, firstDot + 1)}${cleaned.slice(firstDot + 1).replace(/\./g, "")}`;
  return normalized.slice(0, 12);
}

/**
 * A single restock line: product identity, an editable − qty + stepper (from
 * the POS cart pattern in CartStep), a unit-cost field, and remove. Quantity
 * and cost inputs commit on blur/Enter against `onUpdate`; while a field is
 * focused it is a free string so typing never snaps (the field kept jumping
 * back to 1 when it was a controlled number input). Every mutation of
 * `line.quantity`/`line.unitCost` happens inside this component's own
 * commit/step handlers, which also resync the drafts — so the draft state
 * never diverges from the committed line without an effect.
 */
export function RestockLineRow(props: {
  line: PurchaseLine;
  product: Product;
  onUpdate: (productId: string, changes: Partial<PurchaseLine>) => void;
  onRemove: (productId: string) => void;
}) {
  const { line, product, onUpdate, onRemove } = props;

  const [qtyDraft, setQtyDraft] = useState(() => String(line.quantity));
  const [costDraft, setCostDraft] = useState(() => String(line.unitCost || ""));

  function commitQuantity() {
    const committed = parseRestockQuantity(qtyDraft, line.quantity);
    setQtyDraft(String(committed));
    onUpdate(line.productId, { quantity: committed });
  }

  function stepQuantity(delta: number) {
    // Step from what's in the field (parsed, fallback to committed), so a
    // stepper tap right after typing edits the value you can see.
    const base = parseRestockQuantity(qtyDraft, line.quantity);
    const next = Math.max(1, base + delta);
    setQtyDraft(String(next));
    onUpdate(line.productId, { quantity: next });
  }

  function commitCost() {
    const committed = parseUnitCost(costDraft, line.unitCost);
    setCostDraft(committed ? String(committed) : "");
    onUpdate(line.productId, { unitCost: committed });
  }

  return (
    <li className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border px-4 py-3 text-[length:var(--font-size-body)] transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-on-surface">{product.name}</p>
          <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
            {formatCurrency(line.unitCost)} / {product.unitLabel || "piece"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onRemove(line.productId)}
          aria-label={`Remove ${product.name}`}
          className="flex h-[var(--touch-target-min)] w-[var(--touch-target-min)] shrink-0 items-center justify-center rounded-full text-danger hover:bg-danger/10 transition-colors"
        >
          <Trash2 size={18} aria-hidden />
        </button>
      </div>

      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[length:var(--font-size-caption)] text-on-surface-muted">
            Qty ({product.unitLabel || "piece"})
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => stepQuantity(-1)}
              disabled={line.quantity <= 1}
              aria-label={`Decrease ${product.name} quantity`}
              className={`${stepperClass} ${line.quantity <= 1 ? stepperDisabledClass : ""}`}
            >
              −
            </button>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              value={qtyDraft}
              onChange={(e) => setQtyDraft(sanitizeQuantity(e.target.value))}
              onBlur={commitQuantity}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              aria-label={`${product.name} quantity`}
              className={`${inputClass} w-16 text-center`}
            />
            <button
              type="button"
              onClick={() => stepQuantity(1)}
              aria-label={`Increase ${product.name} quantity`}
              className={stepperClass}
            >
              +
            </button>
          </div>
        </div>

        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[length:var(--font-size-caption)] text-on-surface-muted truncate">
            Unit cost (₦)
          </span>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={costDraft}
            onChange={(e) => setCostDraft(sanitizeCost(e.target.value))}
            onBlur={commitCost}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            aria-label={`${product.name} unit cost`}
            className={`${inputClass} w-full`}
          />
        </label>
      </div>

      <p className="text-right text-[length:var(--font-size-caption)] text-on-surface-muted">
        Line total: {formatCurrency(line.quantity * line.unitCost)}
      </p>
    </li>
  );
}