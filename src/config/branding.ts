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
}

export function getBrandingConfig(): BrandingConfig {
  // `||`, not `??`: .env.local ships these as present-but-empty
  // (`NEXT_PUBLIC_BUSINESS_NAME=`) until a client fork fills them in, and an
  // empty string must fall back to the default the same way an unset
  // variable does — `??` only catches null/undefined, so an empty string
  // was slipping through as a real value (e.g. rendering `<link rel="icon"
  // href="">`, an invalid empty href).
  return {
    businessName: process.env.NEXT_PUBLIC_BUSINESS_NAME || "StockPadi",
    accentColor: process.env.NEXT_PUBLIC_BRAND_ACCENT_COLOR || "#0a6e4d",
    logoUrl: process.env.NEXT_PUBLIC_BRAND_LOGO_URL || null,
  };
}
