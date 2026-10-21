"use client";

import { AlertCircle } from "lucide-react";
import { StateCard } from "@/components/ui/StateCard";

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry: () => void;
  className?: string;
}

/** Plain language plus a retry action and dashboard fallback. Never a dead end. */
export function ErrorState({ title = "Something went wrong", message, onRetry, className }: ErrorStateProps) {
  return (
    <StateCard
      role="alert"
      tone="danger"
      icon={AlertCircle}
      title={title}
      description={message}
      action={{ label: "Try again", onClick: onRetry }}
      secondaryAction={{ label: "Return to Dashboard", href: "/dashboard" }}
      className={className}
    />
  );
}
