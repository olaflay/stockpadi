"use client";

import { useState, type ButtonHTMLAttributes } from "react";
import { Wifi } from "lucide-react";
import { Modal } from "./Modal";
import { RippleButton } from "./Ripple";
import { useOnlineStatus } from "@/lib/use-online-status";

export function OfflineNotice({ isOpen, onClose, navigation = false }: {
  isOpen: boolean; onClose: () => void; navigation?: boolean;
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={navigation ? "This page needs a connection" : "This action needs a connection"} variant="dialog">
      <div className="flex flex-col gap-4">
        <Wifi size={28} className="text-on-surface-muted" aria-hidden />
        <p className="text-[length:var(--font-size-body)] text-on-surface-muted">
          {navigation
            ? "You're offline and this screen was not saved for offline use yet. Connect to the internet and try again."
            : "This action can't work offline. Connect to Wi-Fi or mobile data and try again."}
        </p>
        <RippleButton type="button" onClick={onClose} className="min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] bg-brand-accent px-5 text-on-brand">
          {navigation ? "Stay here" : "Got it"}
        </RippleButton>
      </div>
    </Modal>
  );
}

/** One UI feedback for an attempted online-only action; never queues a mutation. */
export function OnlineOnlyButton({ onClick, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const online = useOnlineStatus();
  const [showNotice, setShowNotice] = useState(false);
  return (
    <>
      <RippleButton {...props} data-online-only aria-description={!online ? "Requires an internet connection" : undefined}
        onClick={(event) => {
          // Read the browser value again in case connectivity changed since render.
          if (!navigator.onLine) {
            event.preventDefault();
            setShowNotice(true);
            return;
          }
          onClick?.(event);
        }}>
        {children}
      </RippleButton>
      <OfflineNotice isOpen={showNotice} onClose={() => setShowNotice(false)} />
    </>
  );
}
