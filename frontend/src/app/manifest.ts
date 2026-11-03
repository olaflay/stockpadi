import type { MetadataRoute } from "next";
import { getBrandingConfig } from "@/config/branding";

export default function manifest(): MetadataRoute.Manifest {
  const branding = getBrandingConfig();

  return {
    name: `${branding.businessName} POS & Inventory`,
    short_name: branding.businessName,
    description: `${branding.businessName} is an offline-first point of sale and inventory app for retail businesses.`,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#eff2f3",
    theme_color: "#eff2f3",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
