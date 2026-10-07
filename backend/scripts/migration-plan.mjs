import fs from "node:fs";

export function migrationVersion(filename) {
  return filename.split("_")[0];
}

export function migrationName(filename) {
  const version = migrationVersion(filename);
  return filename.slice(version.length + 1).replace(/\.sql$/, "");
}

export function readMigrationFiles(migrationsDir) {
  const filenames = fs.readdirSync(migrationsDir).filter((filename) => filename.endsWith(".sql")).sort();
  const seenVersions = new Map();
  const migrations = filenames.map((filename) => ({ filename, version: migrationVersion(filename), name: migrationName(filename) }));
  for (const migration of migrations) {
    const previous = seenVersions.get(migration.version);
    if (previous) throw new Error(`Duplicate migration version ${migration.version}: ${previous} and ${migration.filename}`);
    seenVersions.set(migration.version, migration.filename);
  }
  return migrations;
}

function normalizeAppliedName(name) {
  return String(name ?? "").replace(/\.sql$/, "").replace(/^\d+_/, "");
}

export function buildMigrationState(migrations, standardRows, customRows) {
  const expectedVersions = new Set(migrations.map((migration) => migration.version));
  const standardByVersion = new Map(standardRows.map((row) => [String(row.version), row]));
  const customByKey = new Set(customRows.map((row) => String(row.version)));
  const missing = [];
  const applied = [];
  const warnings = [];

  for (const migration of migrations) {
    const standard = standardByVersion.get(migration.version);
    const custom = customByKey.has(migration.filename) || customByKey.has(migration.version);
    if (standard) {
      const recordedName = normalizeAppliedName(standard.name);
      if (recordedName && recordedName !== migration.name) warnings.push(`Migration ${migration.filename} has recorded name ${standard.name}, expected ${migration.name}`);
      applied.push({ ...migration, source: "supabase_migrations" });
    } else if (custom) {
      applied.push({ ...migration, source: "project_migrations" });
      warnings.push(`Migration ${migration.filename} exists only in public._migrations; verify the Supabase migration ledger`);
    } else {
      missing.push(migration);
    }
  }

  const unexpected = [
    ...standardRows.filter((row) => !expectedVersions.has(String(row.version))).map((row) => ({ source: "supabase_migrations", version: String(row.version), name: row.name ?? null })),
    ...customRows.filter((row) => !expectedVersions.has(String(row.version)) && !migrations.some((migration) => migration.filename === String(row.version))).map((row) => ({ source: "project_migrations", version: String(row.version), name: null })),
  ];
  const appliedVersions = new Set(applied.map((migration) => migration.version));
  const currentHead = applied.length ? applied.map((migration) => migration.version).sort().at(-1) : null;
  const expectedHead = migrations.length ? migrations.at(-1).version : null;

  return {
    expected: migrations,
    applied,
    missing,
    unexpected,
    warnings,
    currentHead,
    expectedHead,
    complete: missing.length === 0 && unexpected.length === 0 && warnings.length === 0 && appliedVersions.size === migrations.length,
  };
}

export function migrationIsApplied(state, migration) {
  return state.applied.some((applied) => applied.version === migration.version);
}
