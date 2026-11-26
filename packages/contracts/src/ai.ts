/**
 * Shared safety boundary for future assistant experiments.
 *
 * These contracts deliberately contain no provider or model details. An
 * assistant may prepare a draft, but only the existing application command
 * path may create authoritative business records after explicit confirmation.
 */

export const AI_FEATURE_DEFAULTS = {
  enabled: false,
  voiceEnabled: false,
  imageEnabled: false,
  writeDraftsEnabled: false,
} as const;

export type AiInputModality = "text" | "voice" | "image";
export type AiDraftStatus = "draft" | "confirmed" | "cancelled" | "expired";

export const AI_COMMAND_KINDS = [
  "sale.create",
  "purchase.receive",
  "expense.create",
  "credit_payment.record",
  "stock_adjustment.create",
  "stock_count.submit",
] as const;

export type AiCommandKind = (typeof AI_COMMAND_KINDS)[number];

export interface AiSourceProvenance {
  modality: AiInputModality;
  capturedAt: string;
  /** A digest or internal object reference; never raw sensitive media. */
  sourceReference: string | null;
  transcriptRetained: boolean;
}

export interface AiCommandDraft {
  id: string;
  schemaVersion: 1;
  businessId: string;
  branchId: string | null;
  actorUserId: string;
  commandKind: AiCommandKind;
  /** Untrusted until validated by the normal command handler. */
  payload: Record<string, unknown>;
  idempotencyKey: string;
  status: AiDraftStatus;
  provenance: AiSourceProvenance;
  createdAt: string;
  expiresAt: string;
  confirmedAt: string | null;
  confirmedByUserId: string | null;
}

export interface AiConsentRecord {
  businessId: string;
  actorUserId: string;
  purpose: "assistant_text" | "voice_transcription" | "image_extraction";
  policyVersion: string;
  granted: boolean;
  recordedAt: string;
}

export interface AiSafetyValidationResult {
  valid: boolean;
  errors: string[];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoDate(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

/**
 * Runtime validation for the outer safety envelope only. Domain payloads must
 * still pass their existing command validator at confirmation time.
 */
export function validateAiCommandDraft(value: unknown): AiSafetyValidationResult {
  const errors: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, errors: ["Draft must be an object"] };
  }

  const draft = value as Record<string, unknown>;
  if (!isNonEmptyString(draft.id)) errors.push("id is required");
  if (draft.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!isNonEmptyString(draft.businessId)) errors.push("businessId is required");
  if (draft.branchId !== null && !isNonEmptyString(draft.branchId)) errors.push("branchId must be a non-empty string or null");
  if (!isNonEmptyString(draft.actorUserId)) errors.push("actorUserId is required");
  if (!AI_COMMAND_KINDS.includes(draft.commandKind as AiCommandKind)) errors.push("commandKind is not supported");
  if (!draft.payload || typeof draft.payload !== "object" || Array.isArray(draft.payload)) errors.push("payload must be an object");
  if (!isNonEmptyString(draft.idempotencyKey)) errors.push("idempotencyKey is required");
  if (!["draft", "confirmed", "cancelled", "expired"].includes(String(draft.status))) errors.push("status is not supported");
  if (!isIsoDate(draft.createdAt)) errors.push("createdAt must be an ISO-compatible date");
  if (!isIsoDate(draft.expiresAt)) errors.push("expiresAt must be an ISO-compatible date");

  const provenance = draft.provenance;
  if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) {
    errors.push("provenance is required");
  } else {
    const source = provenance as Record<string, unknown>;
    if (!["text", "voice", "image"].includes(String(source.modality))) errors.push("provenance.modality is not supported");
    if (!isIsoDate(source.capturedAt)) errors.push("provenance.capturedAt must be an ISO-compatible date");
    if (source.sourceReference !== null && !isNonEmptyString(source.sourceReference)) errors.push("provenance.sourceReference must be a non-empty string or null");
    if (typeof source.transcriptRetained !== "boolean") errors.push("provenance.transcriptRetained must be boolean");
  }

  if (isIsoDate(draft.createdAt) && isIsoDate(draft.expiresAt) && Date.parse(draft.expiresAt) <= Date.parse(draft.createdAt)) {
    errors.push("expiresAt must be after createdAt");
  }

  const isConfirmed = draft.status === "confirmed";
  if (isConfirmed && (!isIsoDate(draft.confirmedAt) || !isNonEmptyString(draft.confirmedByUserId))) {
    errors.push("confirmed drafts require confirmedAt and confirmedByUserId");
  }
  if (!isConfirmed && (draft.confirmedAt !== null || draft.confirmedByUserId !== null)) {
    errors.push("unconfirmed drafts cannot contain confirmation attribution");
  }

  return { valid: errors.length === 0, errors };
}

