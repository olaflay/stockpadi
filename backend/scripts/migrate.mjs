import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import { buildMigrationState, migrationIsApplied, readMigrationFiles } from "./migration-plan.mjs";
import { assertMigrationCredentials } from "../../scripts/require-migration-credentials.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../../supabase/migrations");

export async function applyMigrationTransaction(client, migration, sql) {
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query(
      "INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1, $2)",
      [migration.version, migration.filename],
    );
    await client.query(
      "INSERT INTO public._migrations (version) VALUES ($1)",
      [migration.filename],
    );
    await client.query("COMMIT");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* preserve original migration failure */ }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Migration ${migration.filename} failed and was not recorded: ${message}`);
  }
}

export async function runMigrations({ connectionString = process.env.SUPABASE_DB_URL, directory = migrationsDir, client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } }) } = {}) {
  assertMigrationCredentials({ ...process.env, SUPABASE_DB_URL: connectionString });
  if (!fs.existsSync(directory)) throw new Error(`Migrations directory not found: ${directory}`);

  await client.connect();
  try {
    // These are bookkeeping tables, not application schema. Their creation is
    // separate from the per-migration transaction and never marks a migration.
    await client.query("CREATE SCHEMA IF NOT EXISTS supabase_migrations");
    await client.query("CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version TEXT PRIMARY KEY, statements TEXT[], name TEXT)");
    await client.query("CREATE TABLE IF NOT EXISTS public._migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())");
    await client.query("ALTER TABLE public._migrations ENABLE ROW LEVEL SECURITY");
    await client.query("REVOKE ALL ON TABLE public._migrations FROM anon, authenticated");

    const standardRows = (await client.query("SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version")).rows;
    const customRows = (await client.query("SELECT version FROM public._migrations ORDER BY version")).rows;
    const migrations = readMigrationFiles(directory);
    const state = buildMigrationState(migrations, standardRows, customRows);
    if (state.unexpected.length > 0) throw new Error(`Unexpected migration records found: ${JSON.stringify(state.unexpected)}`);
    if (state.warnings.length > 0) throw new Error(`Migration ledger is ambiguous: ${state.warnings.join("; ")}`);

    let processed = 0;
    for (const migration of migrations) {
      if (migrationIsApplied(state, migration)) continue;
      const sql = fs.readFileSync(path.join(directory, migration.filename), "utf8");
      await applyMigrationTransaction(client, migration, sql);
      processed += 1;
    }
    return { processed, expectedHead: state.expectedHead };
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runMigrations();
    console.log(JSON.stringify({ ok: true, ...result }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
