import { defineConfig } from "vitest/config";

/**
 * Runs the PGlite-backed database suites (supabase/__tests__/*.test.ts).
 *
 * These apply the shipped migrations verbatim to a real Postgres engine, so
 * they are the only place tenant isolation, the append-only ledger lock, and
 * the sync_apply_* merge logic are actually exercised.
 *
 * This file did not exist before: frontend/vitest.config.mts excludes
 * "supabase/**", the repository root test script only covers frontend and
 * backend, and CI never invoked these suites. They were unrunnable dead code.
 *
 * Each suite builds its own independent database, so file parallelism is off.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    // Booting a WASM Postgres and applying every migration in filename order.
    hookTimeout: 180000,
    testTimeout: 60000,
    fileParallelism: false,
  },
});
