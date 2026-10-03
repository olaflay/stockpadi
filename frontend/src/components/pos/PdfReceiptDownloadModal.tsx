"use client";

import { useState } from "react";
import { Download, X, Edit3, CheckCircle2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { TextInput } from "@/components/ui/TextInput";
import { RippleButton } from "@/components/ui/Ripple";
import { downloadReceiptPdf, type ReceiptPdfData } from "@/features/pos/receipt-pdf";
import { useToast } from "@/components/ui/Toast";

interface PdfReceiptDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData: ReceiptPdfData;
}

export function PdfReceiptDownloadModal({
  isOpen,
  onClose,
  initialData,
}: PdfReceiptDownloadModalProps) {
  const { showToast } = useToast();
  const [storePhone, setStorePhone] = useState(initialData.phone ?? "");
  const [customerName, setCustomerName] = useState(initialData.customerName ?? "");
  const [footerNote, setFooterNote] = useState(
    initialData.footerNote ?? "Thank you for your patronage! Goods sold in good condition are not returnable."
  );
  const [isDownloading, setIsDownloading] = useState(false);

  if (!isOpen) return null;

  function handleDownload() {
    try {
      setIsDownloading(true);
      downloadReceiptPdf({
        ...initialData,
        phone: storePhone.trim() || undefined,
        customerName: customerName.trim() || undefined,
        footerNote: footerNote.trim() || undefined,
      });
      showToast("Receipt PDF downloaded", "success");
      onClose();
    } catch {
      showToast("Could not generate receipt PDF", "danger");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Download PDF Receipt">
      <div className="flex flex-col gap-4 py-2">
        <p className="text-xs text-on-surface-muted">
          Review or customize receipt details below before downloading your standard PDF receipt.
        </p>

        {/* Quick Edit Fields */}
        <div className="flex flex-col gap-3 rounded-2xl bg-surface-container p-3.5 border border-border/30">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-on-surface-muted">Store Phone / Contact</span>
            <TextInput
              value={storePhone}
              onChange={(e) => setStorePhone(e.target.value)}
              placeholder="e.g. +234 801 234 5678"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-on-surface-muted">Customer Name (optional)</span>
            <TextInput
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g. Walk-in Customer / Alhaji Bello"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-on-surface-muted">Receipt Footer Note</span>
            <textarea
              value={footerNote}
              onChange={(e) => setFooterNote(e.target.value)}
              rows={2}
              className="min-h-[50px] w-full rounded-[var(--radius-control)] border border-border bg-surface px-3 py-2 text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-accent/20"
              placeholder="Thank you message or store return policy..."
            />
          </label>
        </div>

        {/* Receipt Quick Preview Summary */}
        <div className="flex items-center justify-between rounded-xl bg-surface-container-high px-4 py-2.5 text-xs">
          <span className="text-on-surface-muted">Items: {initialData.items.length}</span>
          <span className="font-number font-bold text-on-surface">
            Total: {initialData.total ? `₦${initialData.total.toLocaleString()}` : "₦0"}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-2">
          <RippleButton
            type="button"
            onClick={onClose}
            className="flex-1 rounded-[var(--radius-control)] border border-border bg-surface px-4 py-2.5 text-xs font-semibold text-on-surface hover:bg-surface-container"
          >
            Cancel
          </RippleButton>
          <RippleButton
            type="button"
            onClick={handleDownload}
            disabled={isDownloading}
            className="flex-1 flex items-center justify-center gap-2 rounded-[var(--radius-control)] bg-brand-accent px-4 py-2.5 text-xs font-semibold text-brand-accent-contrast hover:opacity-95 disabled:opacity-50"
          >
            <Download size={16} />
            <span>Download PDF</span>
          </RippleButton>
        </div>
      </div>
    </Modal>
  );
}
