import { describe, expect, it } from "vitest";
// @ts-ignore The migration helper is an intentional Node ESM script module.
import { applyMigrationTransaction } from "./migrate.mjs";
// @ts-ignore The migration helper is an intentional Node ESM script module.
import { buildMigrationState } from "./migration-plan.mjs";

describe("migration state verification", () => {
  it("recognizes an exact applied migration and reports missing and unexpected entries", () => {
    const migrations = [
      { filename: "20260101000000_first.sql", version: "20260101000000", name: "first" },
      { filename: "20260102000000_second.sql", version: "20260102000000", name: "second" },
    ];
    const state = buildMigrationState(
      migrations,
      [{ version: "20260101000000", name: "20260101000000_first.sql" }],
      [{ version: "legacy.sql" }],
    );
    expect(state.applied.map((item) => item.filename)).toEqual(["20260101000000_first.sql"]);
    expect(state.missing.map((item) => item.filename)).toEqual(["20260102000000_second.sql"]);
    expect(state.unexpected).toHaveLength(1);
    expect(state.complete).toBe(false);
  });

  it("does not treat an arbitrary object-already-exists failure as success", async () => {
    const calls: string[] = [];
    const client = { query: async (sql: string) => {
      calls.push(sql);
      if (sql.includes("CREATE TABLE")) throw new Error("relation already exists");
      return { rows: [] };
    } };
    await expect(applyMigrationTransaction(
      client,
      { filename: "20260101000000_first.sql", version: "20260101000000", name: "first" },
      "CREATE TABLE example (id uuid);",
    )).rejects.toThrow("was not recorded");
    expect(calls).toEqual(["BEGIN", "CREATE TABLE example (id uuid);", "ROLLBACK"]);
  });

  it("marks a name mismatch as ambiguous instead of applied", () => {
    const state = buildMigrationState(
      [{ filename: "20260101000000_first.sql", version: "20260101000000", name: "first" }],
      [{ version: "20260101000000", name: "different_name" }],
      [],
    );
    expect(state.warnings[0]).toContain("recorded name");
    expect(state.complete).toBe(false);
  });
});
