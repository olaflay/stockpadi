/** Prefer an in-app history entry. Use a safe parent for direct entries. */
export function hasAppBackHistory(): boolean {
  if (typeof window === "undefined") return false;
  const navigation = (window as Window & { navigation?: { canGoBack: boolean } }).navigation;
  return navigation ? navigation.canGoBack : window.history.length > 1;
}
