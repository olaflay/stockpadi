"use client";

import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import type { AccountType } from "@/features/auth/authorization";
import { StateCard } from "@/components/ui/StateCard";
import type { WorkerCapability } from "@/features/auth/authorization";

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  ADMIN: "Admin",
  BUSINESS_OWNER: "Business Owner",
  WORKER: "Worker",
};

export function PermissionDenied({ requiredAccountTypes, requiredAccountType, requiredCapabilities }: { requiredAccountTypes?: readonly AccountType[]; requiredAccountType?: AccountType; requiredCapabilities?: readonly WorkerCapability[] }) {
  const router = useRouter();
  const labels: string[] = [];
  if (requiredAccountTypes) {
    labels.push(...requiredAccountTypes.map((accountType) => ACCOUNT_TYPE_LABELS[accountType]));
  }
  if (requiredAccountType) {
    labels.push(ACCOUNT_TYPE_LABELS[requiredAccountType]);
  }
  if (requiredCapabilities) {
    labels.push(...requiredCapabilities.map((capability) => capability.replaceAll("_", " ").toLowerCase()));
  }
  const roleList =
    labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;

  return (
    <StateCard
      tone="warning"
      icon={ShieldAlert}
      title={"You don't have access to this screen"}
      description={
        requiredCapabilities?.length ? (
          <>Ask the business owner to grant the <strong className="text-on-surface">{roleList}</strong> permission before trying again.</>
        ) : (
          <>Ask someone with the <strong className="text-on-surface">{roleList}</strong> account type to make this change.</>
        )
      }
      action={{ label: "Go to Dashboard", onClick: () => router.push("/dashboard") }}
      secondaryAction={{ label: "Switch account", href: "/login" }}
    />
  );
}
