"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { getBrandingConfig } from "@/config/branding";
import { StateCard } from "@/components/ui/StateCard";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AppError({ error, reset }: ErrorProps) {
  const branding = getBrandingConfig();

  useEffect(() => {
    // Log crash to console in development and monitoring in production
    console.error("[AppCrash]", error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col p-6">
      <main className="my-auto flex w-full flex-col self-center">
        <StateCard
          role="alert"
          tone="danger"
          icon={AlertCircle}
          title="Something unexpected happened"
          description={`Your ${branding.businessName} data is safe. Your saved work stays on this device.`}
          action={{
            label: "Reload",
            onClick: () => reset(),
          }}
          secondaryAction={{
            label: "Go back",
            onClick: () => {
              if (window.history.length > 1) window.history.back();
              else reset();
            },
          }}
        />
      </main>
    </div>
  );
}
