"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BarcodeFormat,
  BrowserMultiFormatReader,
  ChecksumException,
  DecodeHintType,
  FormatException,
  NotFoundException,
} from "@zxing/library";
import { Camera, ChevronLeft } from "lucide-react";
import { RippleButton } from "./Ripple";
import { resolveScannerProfile, scannerVideoConstraints } from "./scanner-capabilities";

interface NavigatorWithDeviceMemory extends Navigator {
  deviceMemory?: number;
}

const RETAIL_BARCODE_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.CODABAR,
  BarcodeFormat.QR_CODE,
];

interface BarcodeScannerProps {
  onResult: (result: string) => void;
  onCancel: () => void;
  backLabel?: string;
  children?: React.ReactNode;
  bottomBar?: React.ReactNode;
}

export function BarcodeScanner({
  onResult,
  onCancel,
  backLabel = "Back",
  children,
  bottomBar,
}: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string>("");
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const lastScanRef = useRef<{ text: string; time: number }>({ text: "", time: 0 });
  const onResultRef = useRef(onResult);
  const onCancelRef = useRef(onCancel);
  const scannerRef = useRef<HTMLDivElement>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const triggerElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    onResultRef.current = onResult;
    onCancelRef.current = onCancel;
  }, [onResult, onCancel]);

  useEffect(() => {
    triggerElementRef.current = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => backButtonRef.current?.focus({ preventScroll: true }), 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onCancelRef.current();
        return;
      }
      if (event.key !== "Tab" || !scannerRef.current) return;
      const focusable = scannerRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) {
        event.preventDefault();
        event.stopImmediatePropagation();
        scannerRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (document.activeElement === scannerRef.current || !scannerRef.current.contains(document.activeElement)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        event.stopImmediatePropagation();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        event.stopImmediatePropagation();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown, true);
      triggerElementRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    let starting = false;
    const profile = resolveScannerProfile({
      deviceMemory: (navigator as NavigatorWithDeviceMemory).deviceMemory,
      hardwareConcurrency: navigator.hardwareConcurrency,
    });
    const hints = new Map<DecodeHintType, unknown>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, RETAIL_BARCODE_FORMATS);
    const reader = new BrowserMultiFormatReader(hints, profile.successIntervalMs);
    reader.timeBetweenDecodingAttempts = profile.decodeIntervalMs;
    readerRef.current = reader;

    async function startScanner() {
      if (!mounted || starting || document.hidden || !videoRef.current) return;
      starting = true;
      try {
        setError("");
        await reader.decodeFromConstraints(
          {
            audio: false,
            video: scannerVideoConstraints(profile),
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
              if (navigator.vibrate) navigator.vibrate(60);
              onResultRef.current(text);
            }
            // Not-found, checksum, and format misses are normal while the
            // camera is moving. Logging every frame can freeze low-end CPUs.
            if (
              err
              && !(err instanceof NotFoundException)
              && !(err instanceof ChecksumException)
              && !(err instanceof FormatException)
            ) {
              console.error(err);
            }
          }
        );

        const stream = videoRef.current.srcObject;
        const track = typeof MediaStream !== "undefined" && stream instanceof MediaStream
          ? stream.getVideoTracks()[0]
          : undefined;
        if (track?.getCapabilities && track.applyConstraints) {
          const capabilities = track.getCapabilities() as MediaTrackCapabilities & { focusMode?: string[] };
          if (capabilities.focusMode?.includes("continuous")) {
            await track.applyConstraints({
              advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
            }).catch(() => undefined);
          }
        }
      } catch {
        if (mounted) {
          setError("Camera could not start. Check camera permission, then try again.");
        }
      } finally {
        starting = false;
      }
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        reader.reset();
        return;
      }
      void startScanner();
    }

    void startScanner();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      mounted = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      reader.reset();
    };
  }, []);

  const isSplitView = Boolean(children);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={scannerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Barcode scanner"
      tabIndex={-1}
      className="fixed inset-0 z-[100] flex flex-col bg-surface overflow-hidden pt-[env(safe-area-inset-top,0px)]"
    >
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
      <div className="flex min-h-12 shrink-0 items-center gap-2 border-b border-border/40 bg-surface px-2">
        <button
          ref={backButtonRef}
          type="button"
          onClick={() => onCancelRef.current()}
          aria-label={backLabel}
          className="flex min-h-[var(--touch-target-min)] shrink-0 items-center justify-center gap-1 rounded-[var(--radius-control)] px-2.5 text-[length:var(--font-size-body)] font-semibold text-on-surface hover:bg-surface-container active:scale-95 transition-transform"
        >
          <ChevronLeft size={22} aria-hidden />
          <span>{backLabel}</span>
        </button>
        <h2 className="text-[length:var(--font-size-title)] font-semibold text-on-surface">Scan barcode</h2>
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
    </div>,
    document.body,
  );
}
