import { useSyncExternalStore } from "react";

export type SyncRuntimePhase = "idle" | "uploading" | "downloading" | "syncing";

let phase: SyncRuntimePhase = "idle";
const listeners = new Set<() => void>();

export function getSyncRuntimePhase(): SyncRuntimePhase {
  return phase;
}

export function setSyncRuntimePhase(next: SyncRuntimePhase): void {
  if (phase === next) return;
  phase = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSyncRuntimePhase(): SyncRuntimePhase {
  return useSyncExternalStore(subscribe, getSyncRuntimePhase, () => "idle");
}
