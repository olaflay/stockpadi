"use client";

/**
 * Lead system: Samsung One UI — bottom-interaction layout.
 * Owner/Admin adds a new staff member: name, contact, role, branch, and PIN.
 * Online-required: creates an auth.users row via the manage-staff Edge Function.
 * The PIN the owner sets here is what the new staff member uses to unlock the
 * app every day. They can have it reset later from their staff detail screen.
 * See .agents/rules/design-system.md and zero-ai-slop-design.md.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { WifiOff } from "lucide-react";
import { db } from "@/lib/db";
import { ROLES, type Role } from "@/types/roles";
import { hashPin } from "@/lib/pin-hash";
import { callManageStaff, ManageStaffError } from "@/features/auth/manage-staff-client";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { SelectInput } from "@/components/ui/SelectInput";
import { useToast } from "@/components/ui/Toast";
import { RippleButton } from "@/components/ui/Ripple";

import { TextInput } from "@/components/ui/TextInput";
import { useCurrentUser, hasRole } from "@/features/auth/use-current-user";
import { useOnlineStatus } from "@/lib/use-online-status";
import { useScrollToError } from "@/hooks/use-scroll-to-error";

const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  manager: "Manager",
  cashier: "Cashier",
  inventory_staff: "Inventory Staff",
  accountant: "Accountant",
  admin: "Admin",
  super_admin: "Super Admin",
};

const ASSIGNABLE_ROLES = ROLES.filter((role) => role !== "owner" && role !== "super_admin");

export default function NewStaffPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const { showToast } = useToast();
  const isOnline = useOnlineStatus();
  const branches = useLiveQuery(() => db.branches.toArray(), [], []);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [initialPassword, setInitialPassword] = useState("");
  const [role, setRole] = useState<Role>("cashier");
  const [branchId, setBranchId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const errorRef = useScrollToError<HTMLDivElement>(error);

  if (!hasRole(user, ["owner", "admin"])) {
    return (
      <div>
        <ScreenHeader title="Add staff" onBack={() => router.push("/staff")} />
        <PermissionDenied requiredRoles={["owner", "admin"]} />
      </div>
    );
  }

  const canSubmit =
    fullName.trim() &&
    email.trim() &&
    initialPassword.trim().length >= 6 &&
    pin === confirmPin && /^\d{4}$/.test(pin);

  async function handleCreate() {
    setError(null);
    if (!isOnline) {
      setError("Adding staff needs an internet connection.");
      return;
    }
    if (pin !== confirmPin || !/^\d{4}$/.test(pin)) {
      setError("Enter a matching 4-digit PIN.");
      return;
    }

    setBusy(true);
    try {
      const pinHash = await hashPin(pin);
      const result = await callManageStaff({
        action: "create",
        fullName: fullName.trim(),
        phone: phone.trim() || null,
        email: email.trim(),
        initialPassword,
        role,
        branchId,
        pinHash,
      });

      if (result.userId) {
        await db.localUsers.put({
          id: result.userId,
          fullName: fullName.trim(),
          role,
          pinHash,
          isActive: true,
          updatedAt: new Date().toISOString(),
        });
      }

      showToast(`${fullName.trim()} added`, "success");
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

          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--font-size-label)] font-semibold text-on-surface-muted">
              Temporary password
            </span>
            <p className="text-[length:var(--font-size-caption)] text-on-surface-muted -mt-0.5">
              Share this for their first sign-in only. After that, they use their PIN every day.
            </p>
            <TextInput
              id="staff-temp-password"
              value={initialPassword}
              onChange={(e) => setInitialPassword(e.target.value)}
              placeholder="At least 6 characters"
              type="text"
              autoComplete="new-password"
            />
          </label>
        </div>

        {/* Access card */}
        <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface-container/40 p-4">
          <p className="text-[length:var(--font-size-label)] font-semibold text-on-surface-muted uppercase tracking-wide">
            Access
          </p>

          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--font-size-label)] font-semibold text-on-surface-muted">
              Role
            </span>
            <SelectInput
              id="staff-role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </SelectInput>
          </label>

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

        {/* PIN setup card */}
        <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface-container/40 p-4">
          <div className="flex flex-col gap-0.5">
            <p className="text-[length:var(--font-size-label)] font-semibold text-on-surface-muted uppercase tracking-wide">
              Set their PIN
            </p>
            <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
              They will use this 4-digit PIN every day to unlock the register.
            </p>
          </div>
          <div className="flex gap-4">
            <label className="flex flex-col gap-1.5 flex-1">
              <span className="text-[length:var(--font-size-label)] font-semibold text-on-surface-muted">
                Their PIN
              </span>
              <TextInput
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="0000"
                type="password"
                inputMode="numeric"
                maxLength={4}
                className="text-center tracking-widest text-lg"
              />
            </label>
            <label className="flex flex-col gap-1.5 flex-1">
              <span className="text-[length:var(--font-size-label)] font-semibold text-on-surface-muted">
                Confirm PIN
              </span>
              <TextInput
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="0000"
                type="password"
                inputMode="numeric"
                maxLength={4}
                className="text-center tracking-widest text-lg"
              />
            </label>
          </div>
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
