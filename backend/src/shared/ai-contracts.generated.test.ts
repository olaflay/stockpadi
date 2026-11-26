import { describe, expect, it } from "vitest";
import { AI_FEATURE_DEFAULTS, validateAiCommandDraft } from "./ai-contracts.generated.js";

const validDraft = {
  id: "draft-1",
  schemaVersion: 1,
  businessId: "business-1",
  branchId: "branch-1",
  actorUserId: "user-1",
  commandKind: "sale.create",
  payload: { items: [] },
  idempotencyKey: "idem-1",
  status: "draft",
  provenance: {
    modality: "text",
    capturedAt: "2026-11-08T10:00:00.000Z",
    sourceReference: null,
    transcriptRetained: false,
  },
  createdAt: "2026-11-08T10:00:00.000Z",
  expiresAt: "2026-11-08T10:15:00.000Z",
  confirmedAt: null,
  confirmedByUserId: null,
};

describe("future assistant safety contracts", () => {
  it("keeps every assistant capability disabled by default", () => {
    expect(Object.values(AI_FEATURE_DEFAULTS).every((value) => value === false)).toBe(true);
  });

  it("accepts a tenant-scoped, attributable, expiring draft", () => {
    expect(validateAiCommandDraft(validDraft)).toEqual({ valid: true, errors: [] });
  });

  it("rejects an unconfirmed draft carrying false confirmation attribution", () => {
    const result = validateAiCommandDraft({
      ...validDraft,
      confirmedAt: "2026-11-08T10:01:00.000Z",
      confirmedByUserId: "user-1",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("unconfirmed drafts cannot contain confirmation attribution");
  });

  it("rejects a draft without tenant, actor, idempotency, or a future expiry", () => {
    const result = validateAiCommandDraft({
      ...validDraft,
      businessId: "",
      actorUserId: "",
      idempotencyKey: "",
      expiresAt: validDraft.createdAt,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      "businessId is required",
      "actorUserId is required",
      "idempotencyKey is required",
      "expiresAt must be after createdAt",
    ]));
  });
});

