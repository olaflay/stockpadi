"use client";

import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { AboutApp } from "@/features/settings/AboutApp";

/** Open to every role — nothing here is sensitive. */
export default function AboutSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title="About" backHref="/settings" />

      <AboutApp />
    </div>
  );
}
