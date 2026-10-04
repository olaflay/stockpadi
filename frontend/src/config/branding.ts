/**
 * Per-deployment branding layer on top of the fixed design tokens in
 * src/styles/tokens.css. Business name, accent color, and logo come from
 * environment variables so a fork for a new client is a config change, not
 * a code change. See .agents/rules/reusability-and-multi-client.md.
 */

export interface BrandingConfig {
  businessName: string;
  accentColor: string;
  logoUrl: string | null;
  appUrl: string;
  supportEmail: string;
  currency: string;
}

/**
 * Single source of truth for the application's base URL across the entire frontend.
 * Priority:
 *   1. NEXT_PUBLIC_APP_URL environment variable  (required in production)
 *   2. NEXT_PUBLIC_SITE_URL environment variable  (Supabase convention, optional)
 *   3. window.location.origin                     (browser runtime)
 *   4. http://localhost:3000                       (build-time / SSR fallback only)
 *
 * The localhost fallback exists solely so that `new URL(path, getAppUrl())` never
 * throws during `next build`. Production deployments MUST set NEXT_PUBLIC_APP_URL
 * in their Vercel environment variables.
 */
export function getAppUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim().replace(/\/$/, "");
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/$/, "");
  }
  // Build-time / SSR only — never reached in a correctly configured deployment.
  return "http://localhost:3000";
}

export function getBrandingConfig(): BrandingConfig {
  // `||`, not `??`: .env.local ships these as present-but-empty
  // (`NEXT_PUBLIC_BUSINESS_NAME=`) until a client fork fills them in, and an
  // empty string must fall back to the default the same way an unset
  // variable does — `??` only catches null/undefined, so an empty string
  // was slipping through as a real value (e.g. rendering `<link rel="icon"
  // href="">`, an invalid empty href).
  return {
    businessName: process.env.NEXT_PUBLIC_BUSINESS_NAME || "OjàPadi",
    accentColor: process.env.NEXT_PUBLIC_BRAND_ACCENT_COLOR || "#0B7A55",
    logoUrl: process.env.NEXT_PUBLIC_BRAND_LOGO_URL || null,
    appUrl: getAppUrl(),
    supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "",
    currency: process.env.NEXT_PUBLIC_CURRENCY || "NGN",
  };
}
