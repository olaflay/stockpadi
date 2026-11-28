/** Prefer an in-app history entry. Use a safe parent for direct entries. */
export function hasAppBackHistory(): boolean {
  if (typeof window === "undefined") return false;
  const navigation = (window as Window & { navigation?: {
    canGoBack: boolean;
    currentEntry?: { index: number };
    entries?: () => Array<{ url?: string }>;
  } }).navigation;
  if (navigation) {
    if (!navigation.canGoBack) return false;
    const index = navigation.currentEntry?.index ?? -1;
    const previous = navigation.entries?.()[index - 1]?.url;
    if (!previous) return false;
    const url = new URL(previous);
    return url.origin === window.location.origin && !/^\/(login|register|auth)(\/|$)/.test(url.pathname);
  }
  if (document.referrer && new URL(document.referrer).origin !== window.location.origin) return false;
  return window.history.length > 1;
}
