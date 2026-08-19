"use client";

/**
 * Lead system: Samsung One UI — bottom-interaction layout.
 * Business Owner adds a Worker: name, email and optional branch.
 * Online-required: creates an auth.users row via the manage-staff Edge Function.
 * StockPadi generates the worker password and emails it after creation.
 * See .agents/rules/design-system.md and zero-ai-slop-design.md.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { WifiOff } from "lucide-react";
import { db } from "@/lib/db";
import { tenantArray } from "@/lib/local-tenant";
import { callManageStaff, ManageStaffError } from "@/features/auth/manage-staff-client";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { SelectInput } from "@/components/ui/SelectInput";
import { useToast } from "@/components/ui/Toast";
import { RippleButton } from "@/components/ui/Ripple";

import { TextInput } from "@/components/ui/TextInput";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { useOnlineStatus } from "@/lib/use-online-status";
import { useScrollToError } from "@/hooks/use-scroll-to-error";

export default function NewStaffPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const { showToast } = useToast();
  const isOnline = useOnlineStatus();
  const branches = useLiveQuery(() => tenantArray(db.branches), [], []);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [branchId, setBranchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const errorRef = useScrollToError<HTMLDivElement>(error);

  if (user.accountType !== "BUSINESS_OWNER") {
    return (
      <div>
        <ScreenHeader title="Add staff" onBack={() => router.push("/staff")} />
        <PermissionDenied requiredAccountType="BUSINESS_OWNER" />
      </div>
    );
  }

  const canSubmit =
    fullName.trim() &&
    email.trim() &&
    email.trim();

  async function handleCreate() {
    setError(null);
    if (!isOnline) {
      setError("Adding staff needs an internet connection.");
      return;
    }
    setBusy(true);
    try {
      await callManageStaff({
        action: "create",
        fullName: fullName.trim(),
        phone: phone.trim() || null,
        email: email.trim(),
        branchId,
      });
      showToast(`${fullName.trim()} added. Login details were emailed.`, "success");
      router.push("/staff");
    } catch (err) {
      setError(err instanceof ManageStaffError ? err.message : "Could not add this staff member. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-0">
      <ScreenHeader title="Add staff" onBack={() => router.push("/staff")} />

      <div className="flex flex-col gap-4 pb-10">
        {/* Offline banner */}
        {!isOnline && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-[var(--radius-card)] bg-warning-container px-4 py-3 text-[length:var(--font-size-body)] text-on-warning-container"
          >
            <WifiOff size={16} aria-hidden />
            <span>No connection. Adding staff requires internet.</span>
          </div>
        )}

        {error && (
          <div
            ref={errorRef}
            role="alert"
            className="rounded-[var(--radius-card)] bg-danger-container px-4 py-3 text-[length:var(--font-size-body)] text-on-danger-container font-medium"
          >
            {error}
          </div>
        )}

        {/* Personal info card */}
        <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface-container/40 p-4">
          <p className="text-[length:var(--font-size-label)] font-semibold text-on-surface-muted uppercase tracking-wide">
            Staff details
          </p>

          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--font-size-label)] font-semibold text-on-surface-muted">
              Full name
            </span>
            <TextInput
              id="staff-full-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Amina Ibrahim"
              type="text"
              autoComplete="name"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--font-size-label)] font-semibold text-on-surface-muted">
              Phone (optional)
            </span>
            <TextInput
              id="staff-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 08012345678"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--font-size-label)] font-semibold text-on-surface-muted">
              Email (for their login)
            </span>
            <TextInput
              id="staff-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@domain.com"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              inputMode="email"
            />
          </label>

          <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">StockPadi will generate a secure password and send it to this email. The worker uses the normal login screen.</p>
        </div>

        {/* Access card */}
        <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface-container/40 p-4">
          <p className="text-[length:var(--font-size-label)] font-semibold text-on-surface-muted uppercase tracking-wide">
            Access
          </p>

          <p className="text-[length:var(--font-size-body)] text-on-surface-muted">Account type: <strong className="text-on-surface">Worker</strong></p>

          {branches && branches.length > 1 && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[length:var(--font-size-label)] font-semibold text-on-surface-muted">
                Branch
              </span>
              <SelectInput
                id="staff-branch"
                value={branchId ?? ""}
                onChange={(e) => setBranchId(e.target.value || null)}
              >
                <option value="">All branches</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </SelectInput>
            </label>
          )}
        </div>

        <RippleButton
          id="staff-create-submit"
          type="button"
          onClick={handleCreate}
          disabled={!canSubmit || busy}
          className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-brand-accent text-[length:var(--font-size-body-lg)] font-bold text-brand-accent-contrast disabled:opacity-[var(--state-opacity-disabled-content)] hover:opacity-95 transition-opacity duration-[var(--motion-duration-short)] py-3 shadow-[var(--shadow-elevation-1)]"
        >
          {busy ? "Adding…" : "Add staff member"}
        </RippleButton>
      </div>
    </div>
  );
}
