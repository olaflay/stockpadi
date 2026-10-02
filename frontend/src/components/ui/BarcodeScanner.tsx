"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, NotFoundException } from "@zxing/library";
import { Camera, X } from "lucide-react";
import { RippleButton } from "./Ripple";

interface BarcodeScannerProps {
  onResult: (result: string) => void;
  onCancel: () => void;
  children?: React.ReactNode;
  bottomBar?: React.ReactNode;
}

export function BarcodeScanner({ onResult, onCancel, children, bottomBar }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string>("");
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const lastScanRef = useRef<{ text: string; time: number }>({ text: "", time: 0 });
  const onResultRef = useRef(onResult);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    onResultRef.current = onResult;
    onCancelRef.current = onCancel;
  }, [onResult, onCancel]);

  useEffect(() => {
    let mounted = true;
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    async function startScanner() {
      try {
        if (videoRef.current && mounted) {
          // Ask the browser for the environment camera directly.
          await reader.decodeFromConstraints(
            {
              audio: false,
              video: {
                facingMode: { ideal: "environment" },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
            },
            videoRef.current,
            (result, err) => {
              if (result && mounted) {
                const text = result.getText();
                const now = Date.now();
                const { text: lastText, time: lastTime } = lastScanRef.current;

                // Prevent accidental duplicate rapid triggers of same barcode within 1200ms
                if (text === lastText && now - lastTime < 1200) {
                  return;
                }
                // Cooldown between different barcodes of 500ms
                if (text !== lastText && now - lastTime < 500) {
                  return;
                }

                lastScanRef.current = { text, time: now };
                // Heavy, authoritative double-pulse haptic feedback for noisy retail shops
                if (typeof navigator !== "undefined" && navigator.vibrate) {
                  navigator.vibrate([120, 60, 160]);
                }
                onResultRef.current(text);
              }
              if (err && !(err instanceof NotFoundException)) {
                console.error(err);
              }
            }
          );
        }
      } catch {
        if (mounted) {
          setError("Failed to start camera. Please check permissions.");
        }
      }
    }

    startScanner();

    return () => {
      mounted = false;
      reader.reset();
    };
  }, []);

  const isSplitView = Boolean(children);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-surface overflow-hidden">
      <style>{`
        @keyframes scan {
          0%, 100% { top: 0; }
          50% { top: calc(100% - 2px); }
        }
        .animate-scan {
          animation: scan 3s ease-in-out infinite;
        }
      `}</style>

      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between px-4 border-b border-border/40 bg-surface">
        <h2 className="text-[length:var(--font-size-title)] font-semibold text-on-surface">Scan Barcode</h2>
        <button
          type="button"
          onClick={() => onCancelRef.current()}
          aria-label="Close scanner"
          className="flex h-[var(--touch-target-min)] w-[var(--touch-target-min)] items-center justify-center rounded-full text-on-surface-muted hover:bg-surface-container active:scale-95 transition-transform"
        >
          <X size={22} aria-hidden />
        </button>
      </div>

      {/* Viewfinder section — compact when children exist, full-height otherwise */}
      <div
        className={`relative flex flex-col items-center justify-center bg-black transition-all ${
          isSplitView ? "h-[36vh] min-h-[200px] max-h-[300px] shrink-0 p-2" : "flex-1 p-4"
        }`}
      >
        {error ? (
          <div className="text-center p-4 rounded-[var(--radius-card)] bg-danger/20 text-on-danger border border-danger/30">
            <Camera size={40} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">{error}</p>
            <RippleButton
              type="button"
              onClick={onCancel}
              className="mt-3 rounded-full bg-surface px-5 py-1.5 text-on-surface text-xs font-medium border border-border"
            >
              Close
            </RippleButton>
          </div>
        ) : (
          <div
            className={`relative overflow-hidden rounded-2xl bg-surface-container-high flex items-center justify-center ${
              isSplitView ? "w-full max-w-xs h-full" : "w-full max-w-sm aspect-square"
            }`}
          >
            <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" playsInline />

            <div className="absolute inset-0 z-10 box-border border-[24px] border-black/40">
              <div className="relative h-full w-full border-2 border-brand-accent/60 box-border">
                <div className="absolute -left-[2px] -top-[2px] h-3.5 w-3.5 border-l-4 border-t-4 border-brand-accent" />
                <div className="absolute -right-[2px] -top-[2px] h-3.5 w-3.5 border-r-4 border-t-4 border-brand-accent" />
                <div className="absolute -bottom-[2px] -left-[2px] h-3.5 w-3.5 border-b-4 border-l-4 border-brand-accent" />
                <div className="absolute -bottom-[2px] -right-[2px] h-3.5 w-3.5 border-b-4 border-r-4 border-brand-accent" />

                <div className="absolute left-0 top-0 h-0.5 w-full bg-brand-accent animate-scan shadow-sm" />
              </div>
            </div>
          </div>
        )}
        {!isSplitView && (
          <p className="mt-6 text-center text-sm text-white/80">
            Point camera at a barcode to scan
          </p>
        )}
      </div>

      {/* Interactive Staged Items Under Viewfinder */}
      {isSplitView && (
        <div className="flex-1 flex flex-col min-h-0 bg-surface">
          <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
            {children}
          </div>
          {bottomBar && (
            <div className="shrink-0 border-t border-border/40 bg-surface-container-low p-3 shadow-lg">
              {bottomBar}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
