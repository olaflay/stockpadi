"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserCircle, LogOut } from "lucide-react";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { signOut } from "@/features/auth/logout";
import { hashPin } from "@/lib/pin-hash";
import { verifyPin } from "@/lib/pin-hash";
import { db } from "@/lib/db";
import { callManageStaff, ManageStaffError } from "@/features/auth/manage-staff-client";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useToast } from "@/components/ui/Toast";
import { RippleButton } from "@/components/ui/Ripple";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  cashier: "Cashier",
  inventory_staff: "Inventory Staff",
  accountant: "Accountant",
  admin: "Admin",
};

const inputClass =
  "min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] border border-border bg-surface px-3 text-center text-[length:var(--font-size-title-lg)] tracking-[0.5em] text-on-surface";

/** Who am I, my role, change my PIN, logout. Item 16, docs/RESEARCH-AND-PLAN.md. */
export default function ProfilePage() {
  const router = useRouter();
  const user = useCurrentUser();
  const { showToast } = useToast();
  const [changingPin, setChangingPin] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleChangePin() {
    setError(null);
    if (newPin.length !== 4) {
      setError("New PIN must be 4 digits.");
      return;
    }
    if (newPin !== confirmPin) {
      setError("New PINs don't match.");
      return;
    }

    setBusy(true);
    try {
      const localUser = await db.localUsers.get(user.id);
      const ok = await verifyPin(currentPin, localUser?.pinHash ?? null);
      if (!ok) {
        setError("Your current PIN is incorrect.");
        return;
      }
      const pinHash = await hashPin(newPin);
      await callManageStaff({ action: "set_own_pin", pinHash });
      await db.localUsers.update(user.id, { pinHash, updatedAt: new Date().toISOString() });
      showToast("PIN updated", "success");
      setChangingPin(false);
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
    } catch (err) {
      setError(err instanceof ManageStaffError ? err.message : "Couldn't update your PIN. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    await signOut();
    router.replace("/unlock");
  }

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title="Profile" onBack={() => router.push("/settings")} />

      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-accent/10">
          <UserCircle size={40} className="text-brand-accent" aria-hidden />
        </div>
        <div>
          <p className="text-[length:var(--font-size-title-lg)] font-semibold text-on-surface">{user.fullName}</p>
          <p className="text-[length:var(--font-size-body)] text-on-surface-muted">
            {ROLE_LABELS[user.role] ?? user.role}
          </p>
        </div>
      </div>

      <section className="rounded-[var(--radius-card)] border border-border p-4">
        {!changingPin ? (
          <button
            type="button"
            onClick={() => setChangingPin(true)}
            className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-surface-container px-4 text-left text-[length:var(--font-size-body-lg)] text-on-surface hover:bg-surface-container-high transition-colors"
          >
            Change my PIN
          </button>
        ) : (
          <div className="flex flex-col gap-4">
            <h2 className="text-[length:var(--font-size-label)] font-medium text-on-surface-muted">Change PIN</h2>
            {error && (
              <div className="rounded-[var(--radius-card)] bg-danger-container px-4 py-3 text-[length:var(--font-size-body)] text-on-danger-container">
                {error}
              </div>
            )}
            <label className="flex flex-col gap-1">
              <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Current PIN</span>
              <input
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className={inputClass}
                inputMode="numeric"
                type="password"
                maxLength={4}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[length:var(--font-size-label)] text-on-surface-muted">New PIN</span>
              <input
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className={inputClass}
                inputMode="numeric"
                type="password"
                maxLength={4}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Confirm new PIN</span>
              <input
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className={inputClass}
                inputMode="numeric"
                type="password"
                maxLength={4}
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setChangingPin(false);
                  setError(null);
                  setCurrentPin("");
                  setNewPin("");
                  setConfirmPin("");
                }}
                className="min-h-[var(--touch-target-min)] flex-1 rounded-[var(--radius-control)] border border-border px-4 text-[length:var(--font-size-body)] text-on-surface"
              >
                Cancel
              </button>
              <RippleButton
                type="button"
                onClick={handleChangePin}
                disabled={busy || currentPin.length !== 4 || newPin.length !== 4}
                className="min-h-[var(--touch-target-min)] flex-1 rounded-[var(--radius-control)] bg-brand-accent px-4 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save"}
              </RippleButton>
            </div>
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={handleLogout}
        className="flex min-h-[var(--touch-target-min)] items-center justify-center gap-2 rounded-[var(--radius-control)] border border-danger px-4 text-[length:var(--font-size-body)] font-medium text-danger hover:bg-danger-container transition-colors"
      >
        <LogOut size={18} aria-hidden />
        Log out
      </button>
    </div>
  );
}
