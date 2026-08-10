"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, NotFoundException } from "@zxing/library";
import { Camera, X } from "lucide-react";
import { RippleButton } from "./Ripple";

interface BarcodeScannerProps {
  onResult: (result: string) => void;
  onCancel: () => void;
}

export function BarcodeScanner({ onResult, onCancel }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string>("");
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);

  useEffect(() => {
    let mounted = true;
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    async function startScanner() {
      try {
        const videoInputDevices = await reader.listVideoInputDevices();
        if (videoInputDevices.length === 0) {
          if (mounted) setError("No camera found.");
          return;
        }

        // Try to find a back camera
        let deviceId = videoInputDevices[0].deviceId;
        const backCamera = videoInputDevices.find((d) => d.label.toLowerCase().includes("back"));
        if (backCamera) {
          deviceId = backCamera.deviceId;
        }

        if (videoRef.current && mounted) {
          await reader.decodeFromVideoDevice(deviceId, videoRef.current, (result, err) => {
            if (result && mounted) {
              if (navigator.vibrate) navigator.vibrate(100);
              onResult(result.getText());
            }
            if (err && !(err instanceof NotFoundException)) {
              console.error(err);
            }
          });
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
  }, [onResult]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-surface">
      <style>{`
        @keyframes scan {
          0%, 100% { top: 0; }
          50% { top: calc(100% - 2px); }
        }
        .animate-scan {
          animation: scan 3s ease-in-out infinite;
        }
      `}</style>
      <div className="flex h-14 shrink-0 items-center justify-between px-4">
        <h2 className="text-[length:var(--font-size-title)] font-semibold text-on-surface">Scan Barcode</h2>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close scanner"
          className="flex h-[var(--touch-target-min)] w-[var(--touch-target-min)] items-center justify-center rounded-full text-on-surface-muted hover:bg-surface-container"
        >
          <X size={24} aria-hidden />
        </button>
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center bg-black p-4">
        {error ? (
          <div className="text-center p-4 rounded-[var(--radius-card)] bg-danger/20 text-on-danger border border-danger/30">
            <Camera size={48} className="mx-auto mb-4 opacity-50" />
            <p className="text-[length:var(--font-size-body)]">{error}</p>
            <RippleButton type="button" onClick={onCancel} className="mt-4 rounded-full bg-surface px-6 py-2 text-on-surface font-medium border border-border">
              Close
            </RippleButton>
          </div>
        ) : (
          <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-surface-container-high aspect-square flex items-center justify-center">
            <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" playsInline />
            
            <div className="absolute inset-0 z-10 box-border border-[40px] border-black/40">
              <div className="relative h-full w-full border-2 border-brand-accent/50 box-border">
                <div className="absolute -left-[2px] -top-[2px] h-4 w-4 border-l-4 border-t-4 border-brand-accent" />
                <div className="absolute -right-[2px] -top-[2px] h-4 w-4 border-r-4 border-t-4 border-brand-accent" />
                <div className="absolute -bottom-[2px] -left-[2px] h-4 w-4 border-b-4 border-l-4 border-brand-accent" />
                <div className="absolute -bottom-[2px] -right-[2px] h-4 w-4 border-b-4 border-r-4 border-brand-accent" />
                
                <div className="absolute left-0 top-0 h-0.5 w-full bg-brand-accent animate-scan" />
              </div>
            </div>
          </div>
        )}
        <p className="mt-8 text-center text-[length:var(--font-size-body)] text-white/80">
          Point camera at a barcode to scan
        </p>
      </div>
    </div>
  );
}
