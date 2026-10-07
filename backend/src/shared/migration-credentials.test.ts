import { describe, expect, it } from "vitest";
// @ts-ignore This is a small Node ESM policy helper used by CI and release verification.
import { validateMigrationCredentials } from "../../../scripts/require-migration-credentials.mjs";

describe("hosted migration credential policy", () => {
  it("rejects a missing migration URL instead of allowing a silent skip", () => {
    expect(validateMigrationCredentials({})).toEqual({
      ok: false,
      error: "SUPABASE_DB_URL is required for hosted migration verification",
    });
  });

  it("rejects migration credentials without an explicit project identity", () => {
    expect(validateMigrationCredentials({ SUPABASE_DB_URL: "postgresql://user:password@db.example-project.supabase.co:5432/postgres" })).toEqual({
      ok: false,
      error: "SUPABASE_PROJECT_REF is required for hosted migration verification",
    });
  });

  it("rejects a non-PostgreSQL URL", () => {
    expect(validateMigrationCredentials({ SUPABASE_DB_URL: "https://example.test/db" }).ok).toBe(false);
  });

  it("accepts a PostgreSQL URL without exposing its value", () => {
    expect(validateMigrationCredentials({ SUPABASE_DB_URL: "postgresql://user:password@db.example-project.supabase.co:5432/postgres", SUPABASE_PROJECT_REF: "example-project" })).toEqual({ ok: true });
  });

  it("rejects a direct database URL for a different project", () => {
    expect(validateMigrationCredentials({ SUPABASE_DB_URL: "postgresql://user:password@db.other-project.supabase.co:5432/postgres", SUPABASE_PROJECT_REF: "example-project" })).toEqual({
      ok: false,
      error: "SUPABASE_DB_URL project identity does not match SUPABASE_PROJECT_REF",
    });
  });
});
