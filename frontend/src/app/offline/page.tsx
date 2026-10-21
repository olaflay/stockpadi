"use client";

import { useRouter } from "next/navigation";
import { WifiOff } from "lucide-react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StateCard } from "@/components/ui/StateCard";

export default function OfflinePage() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen flex-col bg-surface p-4 sm:p-6">
      <ScreenHeader title="Offline" hideBack />

      <main className="my-auto flex w-full flex-col self-center py-8">
        <StateCard
          icon={WifiOff}
          title={"You're offline"}
          description="Your saved work is safe on this device. Reconnect to open this page."
          action={{ label: "Reload", onClick: () => window.location.reload() }}
          secondaryAction={{ label: "Go back", onClick: () => router.back() }}
        />
      </main>
    </div>
  );
}
