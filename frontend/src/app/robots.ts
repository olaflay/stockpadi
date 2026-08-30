import type { MetadataRoute } from "next";
import { getAppUrl } from "@/config/branding";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getAppUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/register", "/forgot-password", "/reset-password"],
        disallow: [
          "/admin/",
          "/auth/",
          "/work/",
          "/business/",
          "/dashboard",
          "/pos",
          "/sales",
          "/products",
          "/reports",
          "/customers",
          "/expenses",
          "/purchases",
          "/stock-count",
          "/close-day",
          "/alerts",
          "/profile",
          "/settings",
          "/welcome",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
