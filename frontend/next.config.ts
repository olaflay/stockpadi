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
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
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
};

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

export default withSerwist(nextConfig);
