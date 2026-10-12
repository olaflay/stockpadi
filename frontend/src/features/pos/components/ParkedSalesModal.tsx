import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatCurrency } from "@/lib/format";
import type { ParkedSale } from "@/features/pos/parked-sales";

export function ParkedSalesModal(props: {
  isOpen: boolean;
  onClose: () => void;
  parkedSales: ParkedSale[];
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [saleToDiscard, setSaleToDiscard] = useState<string | null>(null);

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={props.onClose}
      title="Held sales"
    >
      <div className="flex flex-col gap-3">
        <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
          Select a held cart to resume or discard.
        </p>
        {props.parkedSales.length === 0 ? (
          <p className="py-4 text-center text-xs text-on-surface-muted">No held sales.</p>
        ) : (
          <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
            {props.parkedSales.map((sale) => {
              const saleQty = sale.lines.reduce((sum, line) => sum + line.quantity, 0);
              const saleSubtotal = sale.lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
              const saleTotal = Math.max(0, saleSubtotal - sale.discount);

              return (
                <li
                  key={sale.id}
                  className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-surface-container p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate font-semibold text-on-surface">{sale.label}</span>
                    <span className="shrink-0 font-number font-bold tabular-nums text-on-surface">
                      {formatCurrency(saleTotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-on-surface-muted">
                    <span>{saleQty} item{saleQty === 1 ? "" : "s"}{sale.discount > 0 ? ` (incl. -${formatCurrency(sale.discount)} discount)` : ""}</span>
                    <span className="shrink-0 text-[10px]">{new Date(sale.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div className="flex gap-2 border-t border-border/40 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        props.onResume(sale.id);
                        props.onClose();
                      }}
                      className="min-h-[var(--touch-target-min)] flex-1 rounded-[var(--radius-control)] bg-brand-accent px-3 py-1.5 font-semibold text-brand-accent-contrast transition-opacity hover:opacity-90"
                    >
                      Resume
                    </button>
                    <button
                      type="button"
                      onClick={() => setSaleToDiscard(sale.id)}
                      className="min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] bg-danger/10 px-3 py-1.5 font-medium text-danger transition-colors hover:bg-danger/20"
                    >
                      Discard
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        isOpen={saleToDiscard !== null}
        onClose={() => setSaleToDiscard(null)}
        onConfirm={() => {
          if (saleToDiscard) props.onDelete(saleToDiscard);
          setSaleToDiscard(null);
        }}
        title="Discard held sale?"
        description="This held sale will be permanently deleted."
        confirmLabel="Discard sale"
        cancelLabel="Keep"
        variant="danger"
      />
    </Modal>
  );
}
