/**
 * Six hand-authored SVG illustrations (docs/RESEARCH-AND-PLAN.md Section
 * 4.5), each earning its place at one real emotional moment rather than
 * decorating every screen. Line art only, stroke="currentColor" so each
 * inherits its wrapper's text color (usually text-brand-accent) and
 * recolors for free in dark mode — no raster assets, ~1-2KB each, inlined,
 * zero network requests. Never shown on the POS checkout screens: a cashier
 * mid-queue wants the button to have already worked, not delight.
 */
export const ILLUSTRATION_VIEWBOX = "0 0 96 96";
export const STROKE_PROPS = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 3,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
