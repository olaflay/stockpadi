"use client";

import { SearchX } from "lucide-react";
import { getBrandingConfig } from "@/config/branding";
import { StateCard } from "@/components/ui/StateCard";

export default function NotFound() {
  const branding = getBrandingConfig();

  return (
    <div className="flex min-h-dvh flex-col bg-surface p-4 sm:p-6">
      <main className="my-auto flex w-full flex-col self-center py-8">
        <StateCard
          icon={SearchX}
          title="Page not found"
          description="The screen or record you requested does not exist or has been moved."
          action={{ label: "Go to Dashboard", href: "/dashboard" }}
          secondaryAction={{ label: `Return to ${branding.businessName} POS`, href: "/pos" }}
        />
      </main>
    </div>
  );
}
