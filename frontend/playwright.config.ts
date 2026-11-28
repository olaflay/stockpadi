import { defineConfig, devices } from "@playwright/test";

const origin = "http://127.0.0.1:3091";
const chromiumChannel = process.env.PLAYWRIGHT_CHROMIUM_CHANNEL;

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: origin,
    serviceWorkers: "allow",
  },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3091",
    url: `${origin}/api/environment`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], channel: chromiumChannel } },
    { name: "android-sized-chromium", use: { ...devices["Pixel 7"], channel: chromiumChannel } },
    ...(process.env.PLAYWRIGHT_INCLUDE_WEBKIT === "1" ? [
      { name: "iphone-webkit", use: { ...devices["iPhone 13"] } },
    ] : []),
  ],
});
