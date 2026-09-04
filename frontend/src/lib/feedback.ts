/**
 * Lightweight audio & haptic feedback for POS interactions.
 * Uses browser-native AudioContext (zero audio file downloads) and
 * navigator.vibrate for haptic ticks on Android.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

/** Play a short sine-wave beep via Web Audio API. */
function playBeep(frequency: number, durationMs: number, volume = 0.15): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gainNode.gain.value = volume;

  const now = ctx.currentTime;
  oscillator.start(now);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000);
  oscillator.stop(now + durationMs / 1000);
}

/** Trigger haptic vibration if supported (Android touch devices). */
function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

/** Barcode scan success: crisp 800Hz beep + haptic tick. */
export function feedbackScanSuccess(): void {
  playBeep(800, 45);
  vibrate(15);
}

/** Add-to-cart confirmation: pleasant 660Hz beep + short vibration. */
export function feedbackAddToCart(): void {
  playBeep(660, 35);
  vibrate(25);
}

/** Sale completion: double-pulse haptic + ascending tone. */
export function feedbackSaleComplete(): void {
  playBeep(880, 60);
  vibrate([30, 40, 30]);
}

/** Error / stock block: low double buzzer + warning vibration. */
export function feedbackError(): void {
  playBeep(300, 80, 0.1);
  vibrate([60, 40, 60]);
}

/** Destructive action warning: double vibration. */
export function feedbackDestructive(): void {
  vibrate([40, 30, 40]);
}
