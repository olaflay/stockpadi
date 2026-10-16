/**
 * splash.ts — dismisses the #splash overlay from layout / index.html.
 * Framework-agnostic: call hideSplash() once your app has mounted.
 *
 *   React : createRoot(el).render(<App />); hideSplash();
 *   Next.js: call inside a root layout client effect.
 *   Vue   : createApp(App).mount('#app'); hideSplash();
 *   Svelte: new App({ target }); hideSplash();
 *   Vanilla/other: call after first render.
 */

const ANIMATION_MS = 1850; // length of the logo animation (see CSS timeline)
const REDUCED_MOTION_MS = 300;
const FADE_FALLBACK_MS = 500; // in case transitionend never fires

let hiding: Promise<void> | null = null;

export function hideSplash(): Promise<void> {
  if (hiding) return hiding;

  if (typeof document === "undefined") {
    return Promise.resolve();
  }

  const el = document.getElementById("splash");
  if (!el) return (hiding = Promise.resolve());

  const reduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const minVisible = reduced ? REDUCED_MOTION_MS : ANIMATION_MS;

  // performance.now() is time since navigation start, so a slow load
  // already "paid" part of the minimum display time.
  const elapsed = typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : 0;
  const wait = Math.max(0, minVisible - elapsed);

  hiding = new Promise<void>((resolve) => {
    window.setTimeout(() => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        el.remove();
        resolve();
      };
      el.addEventListener("transitionend", finish, { once: true });
      window.setTimeout(finish, FADE_FALLBACK_MS);
      el.classList.add("is-leaving");
    }, wait);
  });

  return hiding;
}

/**
 * Reset the hiding promise for testing purposes only.
 */
export function _resetHidingForTesting(): void {
  hiding = null;
}
