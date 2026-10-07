"use client";

import { useEffect } from "react";
import { runSyncCycle, startSyncCoordinator, type SyncCycleResult } from "@/features/sync/SyncCoordinator";

export type { SyncCycleResult };
export { runSyncCycle };

/** Compatibility component retained for existing app composition. */
export function SyncEngine() {
  useEffect(() => startSyncCoordinator(), []);
  return null;
}
