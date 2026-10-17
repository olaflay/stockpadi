import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { TECHNICAL_LEAK_WORDS, STATUS_DICTIONARY } from "../statusMessages";

describe("UI Alert & Notification Components - Automated Technical Leak Audit", () => {
  const targetUiFiles = [
    "src/components/ui/SyncIndicator.tsx",
    "src/components/ui/BannerStrip.tsx",
    "src/components/pwa/ServiceWorkerRegister.tsx",
    "src/features/pos/components/PaymentStep.tsx",
  ];

  it("verifies that all dictionary entries in statusMessages.ts have zero forbidden technical terms", () => {
    for (const [key, entry] of Object.entries(STATUS_DICTIONARY)) {
      const texts = [
        entry.headline,
        entry.body,
        entry.cashierGuarantee,
        entry.cashierAction,
        entry.ownerAction,
        entry.shortStatus,
      ];
      for (const text of texts) {
        for (const word of TECHNICAL_LEAK_WORDS) {
          const regex = new RegExp(`\\b${word}\\b`, "i");
          expect(regex.test(text), `Status ${key} text contains "${word}": "${text}"`).toBe(false);
        }
      }
    }
  });

  it("verifies that all primary sync/alert UI components have zero forbidden technical terms in user-facing JSX/copy", () => {
    const userFacingStringRegex = /["'`]([^"'`]*\b(sync|cloud|refresh|outbox|drain|stream)\b[^"'`]*)["'`]|>([^<]*\b(sync|cloud|refresh|outbox|drain|stream)\b[^<]*)</gi;

    for (const relPath of targetUiFiles) {
      const fullPath = path.resolve(process.cwd(), relPath);
      expect(fs.existsSync(fullPath), `Target file must exist: ${relPath}`).toBe(true);

      const content = fs.readFileSync(fullPath, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // Skip import lines, comments, type annotations, and internal variable assignments
        if (
          line.trim().startsWith("//") ||
          line.trim().startsWith("/*") ||
          line.trim().startsWith("*") ||
          line.trim().startsWith("import ") ||
          line.includes("export type") ||
          line.includes("export interface") ||
          line.includes("@stockpadi") ||
          line.includes("runSyncCycle") ||
          line.includes("drainOutbox") ||
          line.includes("useSyncRuntimePhase") ||
          line.includes("setSyncRuntimePhase") ||
          line.includes("usePendingSyncCount") ||
          line.includes("useFailedSyncCount") ||
          line.includes("useSyncSafety") ||
          line.includes("syncDiagnostics") ||
          line.includes("syncPullState") ||
          line.includes("syncSafety") ||
          line.includes("syncPhase") ||
          line.includes("syncStatusTone") ||
          line.includes("isSyncing") ||
          line.includes("SyncEngine") ||
          line.includes("SyncIndicator") ||
          line.includes("SyncDiagnostic") ||
          line.includes("sync_quarantine") ||
          line.includes("sync-quarantine") ||
          line.includes("SyncPullTrigger") ||
          line.includes("sync-health") ||
          line.includes("sync-runtime-state") ||
          line.includes("sync-observability") ||
          line.includes("sync-lease") ||
          line.includes("sync-realtime") ||
          line.includes("pwa-sync-request") ||
          line.includes("RELOAD_LOOP_KEY") ||
          line.includes("NOTIFICATIONS_DISMISSED_KEY") ||
          line.includes("lastCompletePullAt") ||
          line.includes("lastServerContactAt")
        ) {
          continue;
        }

        const matches = Array.from(line.matchAll(userFacingStringRegex));
        for (const match of matches) {
          const matchedText = (match[1] || match[3] || match[0]).trim();
          if (
            matchedText.startsWith("/") ||
            matchedText.startsWith("@/") ||
            matchedText.includes("sync-health") ||
            matchedText.includes("SyncIndicator") ||
            matchedText.includes("SyncEngine")
          ) {
            continue;
          }

          expect.fail(
            `Forbidden technical jargon word found in ${relPath}:${lineNum}: "${matchedText}" (line: ${line.trim()})`
          );
        }
      }
    }
  });

  it("verifies zero occurrences of hardcoded brand names in user-facing strings in alert components", () => {
    const brandRegex = /["'`]([^"'`]*\b(stockpadi|ojápadi|ojapadi)\b[^"'`]*)["'`]|>([^<]*\b(stockpadi|ojápadi|ojapadi)\b[^<]*)</gi;

    for (const relPath of targetUiFiles) {
      const fullPath = path.resolve(process.cwd(), relPath);
      const content = fs.readFileSync(fullPath, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        if (
          line.trim().startsWith("//") ||
          line.trim().startsWith("/*") ||
          line.trim().startsWith("*") ||
          line.trim().startsWith("import ") ||
          line.includes("@stockpadi") ||
          line.includes("stockpadi-notifications-dismissed") ||
          line.includes("stockpadi:pwa-update-required") ||
          line.includes("stockpadi-pwa-auto-reload-attempt") ||
          line.includes("RELOAD_LOOP_KEY") ||
          line.includes("NOTIFICATIONS_DISMISSED_KEY")
        ) {
          continue;
        }

        const matches = Array.from(line.matchAll(brandRegex));
        for (const match of matches) {
          const matchedText = (match[1] || match[3] || match[0]).trim();
          expect.fail(
            `Hardcoded brand name violation in ${relPath}:${lineNum}: "${matchedText}"`
          );
        }
      }
    }
  });
});
