import path from "node:path";
import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const configuredDevOrigins = (process.env.NEXT_PUBLIC_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
if (process.env.NODE_ENV === "production" && !backendUrl) {
  throw new Error("NEXT_PUBLIC_BACKEND_URL is required when building the production frontend.");
}
if (process.env.NODE_ENV === "production" && process.env.VERCEL === "1" && /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:|\/|$)/i.test(backendUrl ?? "")) {
  throw new Error("NEXT_PUBLIC_BACKEND_URL must point to the deployed backend on Vercel.");
}

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
