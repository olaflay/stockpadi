import path from "node:path";
import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import { getEnvironmentIdentity, validateRuntimeEnvironment } from "@stockpadi/contracts/config";

const configuredDevOrigins = (process.env.NEXT_PUBLIC_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// Browser requests stay same-origin. This value is the Next.js rewrite and
// server-side upstream target; browser feature code still calls /api/*.
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.trim().replace(/\/+$/, "");
const environmentValidation = validateRuntimeEnvironment(process.env, "frontend");
if (process.env.NODE_ENV !== "test" && !environmentValidation.ok) {
  throw new Error(`Frontend environment validation failed: ${environmentValidation.errors.join("; ")}`);
}
const frontendIdentity = getEnvironmentIdentity(process.env, "frontend");

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname, ".."),
  },
  allowedDevOrigins: ["localhost:3000", ...configuredDevOrigins],
  experimental: {
    useOffline: true,
    optimizePackageImports: ["lucide-react", "dexie-react-hooks", "dexie"],
    staleTimes: {
      dynamic: 0,
      static: 60,
    },
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },
  env: {
    NEXT_PUBLIC_APP_ENV: frontendIdentity.environment,
    NEXT_PUBLIC_BUILD_VERSION: frontendIdentity.buildVersion,
    NEXT_PUBLIC_SUPABASE_PROJECT_REF: frontendIdentity.supabaseProjectRef ?? "",
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl || "http://localhost:8787"}/api/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), geolocation=(), microphone=(), payment=(), usb=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "CDN-Cache-Control", value: "no-store" },
          { key: "Vercel-CDN-Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

export default withSerwist(nextConfig);
