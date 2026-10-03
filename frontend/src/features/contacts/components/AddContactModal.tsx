"use client";

import { useState } from "react";
import { User, Phone, Check, AlertCircle, BookUser } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { TextInput } from "@/components/ui/TextInput";
import { RippleButton } from "@/components/ui/Ripple";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { saveNewContact, type SaveContactKind } from "../contact-save";
import { useToast } from "@/components/ui/Toast";
import { isContactPickerSupported, openNativeContactPicker } from "@/lib/contact-picker";

interface AddContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  defaultKind?: SaveContactKind;
}

export function AddContactModal({
  isOpen,
  onClose,
  onSaved,
  defaultKind = "customer",
}: AddContactModalProps) {
  const user = useCurrentUser();
  const { showToast } = useToast();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [kind, setKind] = useState<SaveContactKind>(defaultKind);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function resetForm() {
    setName("");
    setPhone("");
    setKind(defaultKind);
    setError(null);
    setSaving(false);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handlePickContact() {
    const picked = await openNativeContactPicker();
    if (picked) {
      if (picked.name) setName(picked.name);
      if (picked.phone) setPhone(picked.phone);
      if (error) setError(null);
      showToast(`Selected ${picked.name || "contact"}`, "success");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter the contact's name");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      await saveNewContact({
        name: name.trim(),
        phone: phone.trim(),
        kind,
        actor: user,
      });

      showToast("Contact saved successfully", "success");
      onSaved();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save contact");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add New Contact">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-danger/10 px-3.5 py-2.5 text-xs text-danger">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {isContactPickerSupported() && (
          <button
            type="button"
            onClick={handlePickContact}
            className="flex items-center justify-center gap-2 rounded-xl border border-border/80 bg-surface-container-low px-4 py-2 text-xs font-semibold text-brand-accent hover:bg-surface-container transition-all active:scale-[0.98]"
          >
            <BookUser size={15} />
            <span>Pick from phone contacts</span>
          </button>
        )}

        {/* Contact Type Chips */}
        <div>
          <label className="text-[length:var(--font-size-label)] font-medium text-on-surface-muted">
            Contact Type
          </label>
          <div className="mt-1.5 flex gap-2">
            {(
              [
                { value: "customer", label: "Customer" },
                { value: "supplier", label: "Supplier" },
                { value: "both", label: "Both" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setKind(opt.value)}
                className={`flex-1 rounded-xl py-2 px-3 text-xs font-semibold transition-all ${
                  kind === opt.value
                    ? "bg-brand-accent text-brand-accent-contrast shadow-xs"
                    : "bg-surface-container-high text-on-surface hover:bg-surface-container-highest"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Full Name */}
        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--font-size-label)] font-medium text-on-surface-muted">
            Full Name *
          </span>
          <div className="relative">
            <User
              size={18}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-muted"
            />
            <TextInput
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. Alhassan Danladi"
              className="pl-10"
              autoFocus
              required
            />
          </div>
        </label>

        {/* Phone Number */}
        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--font-size-label)] font-medium text-on-surface-muted">
            Phone Number (Optional)
          </span>
          <div className="relative">
            <Phone
              size={18}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-muted"
            />
            <TextInput
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 0803 123 4567"
              className="pl-10"
            />
          </div>
          <p className="text-[11px] text-on-surface-muted">
            Used for WhatsApp debt reminders and receipts.
          </p>
        </label>

        {/* Action Buttons */}
        <div className="mt-2 flex gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 rounded-xl bg-surface-container-high px-4 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container-highest transition-colors"
          >
            Cancel
          </button>
          <RippleButton
            type="submit"
            disabled={saving || !name.trim()}
            className="flex-1 rounded-xl bg-brand-accent px-4 py-2.5 text-sm font-semibold text-brand-accent-contrast disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
          >
            <Check size={16} />
            <span>{saving ? "Saving..." : "Save Contact"}</span>
          </RippleButton>
        </div>
      </form>
    </Modal>
  );
}
