"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getSyncSafety } from "@/features/sync/sync-safety";

export function useSyncSafety() {
  return useLiveQuery(getSyncSafety, [], { required: false, queueCount: 0, oldestPendingAt: null, ageMs: 0 });
}
