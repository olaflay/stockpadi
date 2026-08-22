"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { ROLES, type Role } from "@/types/roles";
import { PERMISSION_ACTIONS, PERMISSION_LABELS, PERMISSION_MATRIX, PERMISSION_LIMITED_NOTES } from "@/types/permissions";
import { hashPin } from "@/lib/pin-hash";
import { callManageStaff, ManageStaffError } from "@/features/auth/manage-staff-client";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { SelectInput } from "@/components/ui/SelectInput";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { ErrorState } from "@/components/ui/ErrorState";
import { useToast } from "@/components/ui/Toast";
import { RippleButton } from "@/components/ui/Ripple";
import { TextInput } from "@/components/ui/TextInput";
import { useCurrentUser, hasRole } from "@/features/auth/use-current-user";

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



interface PageProps {
  params: Promise<{ id: string }>;
}

export default function StaffDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const user = useCurrentUser();
  const { showToast } = useToast();

  const [loadError, setLoadError] = useState<string | null>(null);
  const staffMember = useLiveQuery(async () => {
    try {
      const result = await db.localUsers.get(id);
      setLoadError(null);
      return result;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load this staff member.");
      return null;
    }
  }, [id]);
  const [resettingPin, setResettingPin] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [newPinConfirm, setNewPinConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!hasRole(user, ["owner", "admin"])) {
    return (
      <div>
        <ScreenHeader title="Staff member" onBack={() => router.push("/staff")} />
        <PermissionDenied requiredRoles={["owner", "admin"]} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div>
        <ScreenHeader title="Staff member" onBack={() => router.push("/staff")} />
        <ErrorState message="Couldn't load this staff member." onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (staffMember === undefined) {
    return (
      <div>
        <ScreenHeader title="Staff member" onBack={() => router.push("/staff")} />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (!staffMember) {
    return (
      <div>
        <ScreenHeader title="Staff member" onBack={() => router.push("/staff")} />
        <p className="text-center text-[length:var(--font-size-body)] text-on-surface-muted">Not found on this device.</p>
      </div>
    );
  }

  const isSelf = staffMember.id === user.id;
  const canModify = staffMember.role !== "owner" || user.role === "owner";

  async function handleRoleChange(role: Role) {
    if (!staffMember) return;
    setError(null);
    setBusy(true);
    try {
      await callManageStaff({ action: "change_role", userId: staffMember.id, role });
      await db.localUsers.update(staffMember.id, { role, updatedAt: new Date().toISOString() });
      showToast("Role updated", "success");
    } catch (err) {
      setError(err instanceof ManageStaffError ? err.message : "Couldn't update role.");
    } finally {
      setBusy(false);
    }
  }

  async function handleTogglePermission(action: (typeof PERMISSION_ACTIONS)[number], value: boolean) {
    if (!staffMember) return;
    const overrides = { ...(staffMember.permissionOverrides ?? {}), [action]: value };
    await db.localUsers.update(staffMember.id, { permissionOverrides: overrides, updatedAt: new Date().toISOString() });
  }

  async function handleResetPin() {
    if (!staffMember || newPin !== newPinConfirm || !/^\d{4}$/.test(newPin)) return;
    setError(null);
    setBusy(true);
    try {
      const pinHash = await hashPin(newPin);
      await callManageStaff({ action: "reset_pin", userId: staffMember.id, pinHash });
      await db.localUsers.update(staffMember.id, { pinHash, updatedAt: new Date().toISOString() });
      showToast("PIN reset", "success");
      setResettingPin(false);
      setNewPin("");
      setNewPinConfirm("");
    } catch (err) {
      setError(err instanceof ManageStaffError ? err.message : "Could not reset PIN.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeactivate() {
    if (!staffMember) return;
    if (!confirm(`Deactivate ${staffMember.fullName}? They will no longer be able to sign in.`)) return;
    setBusy(true);
    try {
      await callManageStaff({ action: "deactivate", userId: staffMember.id });
      await db.localUsers.update(staffMember.id, { isActive: false, updatedAt: new Date().toISOString() });
      showToast(`${staffMember.fullName} deactivated`, "success");
      router.push("/staff");
    } catch (err) {
      setError(err instanceof ManageStaffError ? err.message : "Couldn't deactivate.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title={staffMember.fullName} onBack={() => router.push("/staff")} />

      {error && (
        <div className="rounded-[var(--radius-card)] bg-danger-container px-4 py-3 text-[length:var(--font-size-body)] text-on-danger-container">
          {error}
        </div>
      )}

      <section>
        <h2 className="mb-2 text-[length:var(--font-size-label)] font-medium text-on-surface-muted">Role</h2>
        {staffMember.role === "owner" ? (
          <p className="text-[length:var(--font-size-body)] text-on-surface">Owner (cannot be changed)</p>
        ) : (
          <SelectInput value={staffMember.role} onChange={(e) => handleRoleChange(e.target.value as Role)} disabled={busy || !canModify}>
            {ASSIGNABLE_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </SelectInput>
        )}
      </section>

      {staffMember.role !== "owner" && (
        <section>
          <h2 className="mb-2 text-[length:var(--font-size-label)] font-medium text-on-surface-muted">
            Permissions (on top of the {ROLE_LABELS[staffMember.role]} preset)
          </h2>
          <div className="flex flex-col divide-y divide-border rounded-[var(--radius-card)] border border-border">
            {PERMISSION_ACTIONS.map((action) => {
              const defaultLevel = PERMISSION_MATRIX[action][staffMember.role];
              const override = staffMember.permissionOverrides?.[action];
              const checked = override ?? defaultLevel !== "no";
              const note = PERMISSION_LIMITED_NOTES[action]?.[staffMember.role];
              return (
                <label key={action} className="flex min-h-[var(--touch-target-min)] items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block text-[length:var(--font-size-body)] text-on-surface">
                      {PERMISSION_LABELS[action]}
                    </span>
                    {note && !override && (
                      <span className="block text-[length:var(--font-size-caption)] text-on-surface-muted">{note}</span>
                    )}
                  </span>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!canModify}
                    onChange={(e) => handleTogglePermission(action, e.target.checked)}
                    className="h-5 w-5 shrink-0 accent-[var(--color-brand-accent)]"
                  />
                </label>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-[length:var(--font-size-label)] font-semibold text-on-surface-muted uppercase tracking-wide">PIN</h2>
        {!resettingPin ? (
          <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-surface-container/40 p-4">
            <p className="text-[length:var(--font-size-body)] text-on-surface">
              {staffMember.pinHash
                ? isSelf
                  ? "Your PIN is set."
                  : "PIN is set."
                : isSelf
                ? "You have not set a PIN yet."
                : "No PIN set yet."}
            </p>
            {!staffMember.pinHash && (
              <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
                {isSelf
                  ? "Set a PIN so you can unlock the register."
                  : "This person cannot unlock the register until a PIN is set."}
              </p>
            )}
            <RippleButton
              type="button"
              onClick={() => setResettingPin(true)}
              disabled={!canModify}
              className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] border border-brand-accent px-4 text-[length:var(--font-size-body)] font-semibold text-brand-accent disabled:opacity-[var(--state-opacity-disabled-content)] hover:bg-brand-accent/5 transition-colors duration-[var(--motion-duration-short)]"
            >
              {staffMember.pinHash
                ? isSelf ? "Reset my PIN" : "Reset their PIN"
                : isSelf ? "Set my PIN" : "Set their PIN"}
            </RippleButton>
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface-container/40 p-4">
            <div className="flex gap-4">
              <label className="flex flex-col gap-1.5 flex-1">
                <span className="text-[length:var(--font-size-label)] font-semibold text-on-surface-muted">
                  {isSelf ? "New PIN" : "Set their PIN"}
                </span>
                <TextInput
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
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
                  value={newPinConfirm}
                  onChange={(e) => setNewPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="0000"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  className="text-center tracking-widest text-lg"
                />
              </label>
            </div>
            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={() => {
                  setResettingPin(false);
                  setNewPin("");
                  setNewPinConfirm("");
                }}
                className="min-h-[var(--touch-target-min)] flex-1 rounded-[var(--radius-control)] border border-border px-4 text-[length:var(--font-size-body)] text-on-surface hover:bg-surface-container-high transition-colors duration-[var(--motion-duration-short)]"
              >
                Cancel
              </button>
              <RippleButton
                type="button"
                onClick={handleResetPin}
                disabled={busy || newPin !== newPinConfirm || !/^\d{4}$/.test(newPin)}
                className="min-h-[var(--touch-target-min)] flex-1 rounded-[var(--radius-control)] bg-brand-accent px-4 text-[length:var(--font-size-body)] font-bold text-brand-accent-contrast disabled:opacity-[var(--state-opacity-disabled-content)] hover:opacity-95 transition-opacity duration-[var(--motion-duration-short)]"
              >
                {busy ? "Saving…" : "Save PIN"}
              </RippleButton>
            </div>
          </div>
        )}
      </section>

      {staffMember.role !== "owner" && staffMember.isActive && (
        <button
          type="button"
          onClick={handleDeactivate}
          disabled={busy || !canModify}
          className="min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] border border-danger px-4 text-[length:var(--font-size-body)] font-medium text-danger disabled:opacity-50 hover:bg-danger-container transition-colors"
        >
          Deactivate
        </button>
      )}
    </div>
  );
}
