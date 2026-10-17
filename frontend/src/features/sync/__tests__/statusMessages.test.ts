import { describe, expect, it } from "vitest";
import {
  containsTechnicalLeak,
  extractErrorCode,
  isDisruptiveToCashier,
  resolveStatusMessage,
  resolveSystemState,
  STATUS_DICTIONARY,
  TECHNICAL_LEAK_WORDS,
  type SyncSystemStateId,
} from "../statusMessages";

describe("statusMessages - Centralized Status Dictionary & Error Decoupling", () => {
  const allStateIds: SyncSystemStateId[] = [
    "OFFLINE_SAFE",
    "ONLINE_SAVED",
    "SAVING_IN_PROGRESS",
    "BACKGROUND_CATALOG_PENDING",
    "DRAIN_TEMPORARY_NETWORK_ERROR",
    "DRAIN_BLOCKED_OR_FAILED",
    "DATA_CONFLICT",
    "AUTH_EXPIRED",
    "ACCOUNT_PENDING_APPROVAL",
    "BRANCH_ACCESS_CHANGED",
    "SAFETY_BACKPRESSURE_LIMIT",
    "APP_UPDATE_REQUIRED",
    "DATABASE_LOCKED_OTHER_TABS",
    "UNKNOWN_ERROR",
  ];

  describe("Dictionary Completeness and Integrity", () => {
    it("defines every required system state with required metadata fields", () => {
      for (const id of allStateIds) {
        const entry = STATUS_DICTIONARY[id];
        expect(entry, `State ${id} must exist in STATUS_DICTIONARY`).toBeDefined();
        expect(entry.id).toBe(id);
        expect(entry.headline.trim().length).toBeGreaterThan(0);
        expect(entry.body.trim().length).toBeGreaterThan(0);
        expect(entry.cashierGuarantee.trim().length).toBeGreaterThan(0);
        expect(entry.cashierAction.trim().length).toBeGreaterThan(0);
        expect(entry.ownerAction.trim().length).toBeGreaterThan(0);
        expect(["ambient", "toast", "banner", "modal"]).toContain(entry.cashierSurface);
        expect(["ambient", "banner", "modal"]).toContain(entry.ownerSurface);
        expect(["info", "neutral", "success", "warning", "danger"]).toContain(entry.severity);
        expect(entry.shortStatus.trim().length).toBeGreaterThan(0);
      }
    });

    it("enforces explicit cashier device-safety guarantees across all state definitions", () => {
      for (const id of allStateIds) {
        const entry = STATUS_DICTIONARY[id];
        const guarantee = entry.cashierGuarantee.toLowerCase();
        const hasSafeGuarantee = guarantee.includes("safe") || guarantee.includes("saved") || guarantee.includes("preserved") || guarantee.includes("protected");
        expect(hasSafeGuarantee, `State ${id} cashierGuarantee must affirm device safety: "${entry.cashierGuarantee}"`).toBe(true);
      }
    });
  });

  describe("Zero-Jargon Law & Technical Leak Prohibitions", () => {
    it("guarantees zero technical leak words in any headline, body, guarantee, or action", () => {
      for (const id of allStateIds) {
        const entry = STATUS_DICTIONARY[id];
        const fieldsToCheck = [
          { name: "headline", text: entry.headline },
          { name: "body", text: entry.body },
          { name: "cashierGuarantee", text: entry.cashierGuarantee },
          { name: "cashierAction", text: entry.cashierAction },
          { name: "ownerAction", text: entry.ownerAction },
          { name: "shortStatus", text: entry.shortStatus },
        ];

        for (const field of fieldsToCheck) {
          expect(
            containsTechnicalLeak(field.text),
            `State ${id} field "${field.name}" contains prohibited technical jargon: "${field.text}"`
          ).toBe(false);

          for (const word of TECHNICAL_LEAK_WORDS) {
            const regex = new RegExp(`\\b${word}\\b`, "i");
            expect(
              regex.test(field.text),
              `State ${id} field "${field.name}" matches prohibited word "${word}": "${field.text}"`
            ).toBe(false);
          }
        }
      }
    });

    it("guarantees zero hardcoded brand names in any dictionary entry (Strict Rule 7)", () => {
      for (const id of allStateIds) {
        const entry = STATUS_DICTIONARY[id];
        const combined = `${entry.headline} ${entry.body} ${entry.cashierGuarantee} ${entry.cashierAction} ${entry.ownerAction}`;
        expect(combined).not.toMatch(/stockpadi/i);
        expect(combined).not.toMatch(/ojápadi/i);
        expect(combined).not.toMatch(/ojapadi/i);
      }
    });
  });

  describe("Ambient Demotion on POS Checkout", () => {
    it("demotes background catalog drops to ambient surface with neutral severity", () => {
      const state = resolveStatusMessage(null, {
        isOnline: true,
        pendingCount: 0,
        failedCount: 0,
        pullFailure: true,
      });

      expect(state.id).toBe("BACKGROUND_CATALOG_PENDING");
      expect(state.cashierSurface).toBe("ambient");
      expect(state.severity).toBe("neutral");
      expect(isDisruptiveToCashier(state)).toBe(false);
      expect(state.cashierAction).toBe("Keep selling normally.");
      expect(state.cashierGuarantee).toContain("Safe to sell");
    });
  });

  describe("Systemic Decoupling and Error Normalization", () => {
    it("maps offline network conditions to OFFLINE_SAFE", () => {
      const state = resolveStatusMessage(null, { isOnline: false, pendingCount: 3 });
      expect(state.id).toBe("OFFLINE_SAFE");
      expect(state.headline).toBe("Offline");
      expect(state.cashierSurface).toBe("ambient");
    });

    it("maps transient network errors during outbox drain to DRAIN_TEMPORARY_NETWORK_ERROR", () => {
      const state = resolveStatusMessage("NETWORK_UNAVAILABLE", { isOnline: true, pendingCount: 2 });
      expect(state.id).toBe("DRAIN_TEMPORARY_NETWORK_ERROR");
      expect(state.headline).toBe("Waiting to save");
    });

    it("maps durable mutation failures to DRAIN_BLOCKED_OR_FAILED", () => {
      const state = resolveStatusMessage(null, { isOnline: true, failedCount: 2 });
      expect(state.id).toBe("DRAIN_BLOCKED_OR_FAILED");
      expect(state.ownerSurface).toBe("banner");
      expect(state.severity).toBe("danger");
      expect(state.headline).toBe("Review needed");
    });

    it("maps simultaneous edits to DATA_CONFLICT", () => {
      const state = resolveStatusMessage("CONFLICT", { hasConflicts: true });
      expect(state.id).toBe("DATA_CONFLICT");
      expect(state.headline).toBe("Review changes");
      expect(state.cashierSurface).toBe("ambient");
    });

    it("maps auth session expirations to AUTH_EXPIRED", () => {
      const state = resolveStatusMessage("AUTH_SESSION_EXPIRED");
      expect(state.id).toBe("AUTH_EXPIRED");
      expect(state.headline).toBe("Sign-in expired");
      expect(state.cashierGuarantee.toLowerCase()).toContain("safe");
    });

    it("maps store pending verification to ACCOUNT_PENDING_APPROVAL", () => {
      const state = resolveStatusMessage("ACCOUNT_NOT_APPROVED");
      expect(state.id).toBe("ACCOUNT_PENDING_APPROVAL");
      expect(state.headline).toBe("Pending setup");
    });

    it("maps worker branch reassignments to BRANCH_ACCESS_CHANGED", () => {
      const state = resolveStatusMessage("PULL_BRANCH_SCOPE_MISMATCH");
      expect(state.id).toBe("BRANCH_ACCESS_CHANGED");
      expect(state.headline).toBe("Branch changed");
    });

    it("maps high-risk safety backpressure to SAFETY_BACKPRESSURE_LIMIT", () => {
      const rawError = new Error("SYNC_REQUIRED: 120 changes have been waiting since yesterday. Sync before recording another high-risk operation.");
      const state = resolveStatusMessage(rawError);
      expect(state.id).toBe("SAFETY_BACKPRESSURE_LIMIT");
      expect(state.headline).toBe("Save required");
      expect(state.cashierSurface).toBe("modal");
      expect(state.headline).not.toContain("SYNC_REQUIRED");
      expect(state.body).not.toContain("SYNC_REQUIRED");
    });

    it("maps client build upgrade required to APP_UPDATE_REQUIRED", () => {
      const state = resolveStatusMessage("CLIENT_UPGRADE_REQUIRED");
      expect(state.id).toBe("APP_UPDATE_REQUIRED");
      expect(state.headline).toBe("Update ready");
    });

    it("maps multi-tab database locks to DATABASE_LOCKED_OTHER_TABS", () => {
      const state = resolveStatusMessage(null, { databaseBlocked: true });
      expect(state.id).toBe("DATABASE_LOCKED_OTHER_TABS");
      expect(state.headline).toBe("Close other tabs");
      expect(state.body).not.toContain("StockPadi");
    });

    it("safely shields unknown engine/database exceptions from leaking into UI", () => {
      const unexpectedError = new Error("PostgreSQL connection terminated unexpectedly: 08006 (SSL connection has been closed)");
      const state = resolveStatusMessage(unexpectedError);
      expect(state.id).toBe("UNKNOWN_ERROR");
      expect(state.headline).toBe("Connection issue");
      expect(state.body).not.toContain("PostgreSQL");
      expect(state.body).not.toContain("08006");
      expect(state.cashierGuarantee.toLowerCase()).toContain("safe");
    });
  });
});
