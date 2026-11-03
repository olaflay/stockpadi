export type ScannerTier = "low" | "balanced" | "capable";

export interface ScannerDeviceSignals {
  deviceMemory?: number;
  hardwareConcurrency?: number;
}

export interface ScannerProfile {
  tier: ScannerTier;
  width: number;
  height: number;
  frameRate: number;
  decodeIntervalMs: number;
  successIntervalMs: number;
}

export function resolveScannerProfile(signals: ScannerDeviceSignals): ScannerProfile {
  const memory = signals.deviceMemory;
  const cores = signals.hardwareConcurrency;

  if ((memory !== undefined && memory <= 2) || (cores !== undefined && cores <= 4)) {
    return {
      tier: "low",
      width: 640,
      height: 480,
      frameRate: 15,
      decodeIntervalMs: 180,
      successIntervalMs: 900,
    };
  }

  if ((memory !== undefined && memory >= 8) && (cores !== undefined && cores >= 8)) {
    return {
      tier: "capable",
      width: 1280,
      height: 720,
      frameRate: 30,
      decodeIntervalMs: 60,
      successIntervalMs: 500,
    };
  }

  return {
    tier: "balanced",
    width: 960,
    height: 540,
    frameRate: 24,
    decodeIntervalMs: 100,
    successIntervalMs: 650,
  };
}

export function scannerVideoConstraints(profile: ScannerProfile): MediaTrackConstraints {
  return {
    facingMode: { ideal: "environment" },
    width: { ideal: profile.width },
    height: { ideal: profile.height },
    frameRate: { ideal: profile.frameRate, max: profile.frameRate },
  };
}
