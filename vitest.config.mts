import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // The PGlite-backed suites (supabase/__tests__, src/features/sync/__tests__)
    // boot a real WASM Postgres in beforeAll, which reliably exceeds vitest's
    // default 10s hook timeout on CI-grade hardware.
    hookTimeout: 30000,
  },
});
