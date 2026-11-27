/** Only generated business-review paths can survive the login redirect. */
export function adminReviewRoute(path: string | null): string | null {
  return path && /^\/admin\/businesses\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(path) ? path : null;
}
