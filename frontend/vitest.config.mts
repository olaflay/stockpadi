import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
      "@stockpadi/contracts": path.resolve(dirname, "../packages/contracts/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["backend/**", "supabase/**"],
    // The PGlite-backed suites (supabase/__tests__, src/features/sync/__tests__)
    // boot a real WASM Postgres in beforeAll, which reliably exceeds vitest's
    // default 10s hook timeout on CI-grade hardware.
    hookTimeout: 30000,
    // Suites that exercise a full 500-item outbox against fake-indexeddb write
    // several thousand records per case, which overruns the 5s default on
    // slower machines.
    testTimeout: 60000,
  },
});
