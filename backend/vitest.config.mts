import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "../supabase/__tests__/**/*.test.ts"],
    // PGlite boots an in-process WASM PostgreSQL instance per suite. Running
    // those suites in parallel exhausts constrained developer/CI memory and
    // makes the result unreliable. Keep the complete suite, but serialize
    // files in one isolated worker.
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    isolate: true,
    // The PGlite-backed suites boot a real WASM Postgres in beforeAll,
    // which reliably exceeds vitest's default 10s hook timeout on
    // CI-grade hardware.
    hookTimeout: 30000,
  },
});
