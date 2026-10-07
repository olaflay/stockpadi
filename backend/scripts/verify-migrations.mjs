import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { buildMigrationState, readMigrationFiles } from "./migration-plan.mjs";
import { assertMigrationCredentials } from "../../scripts/require-migration-credentials.mjs";

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../supabase/migrations");
const connectionString = process.env.SUPABASE_DB_URL;
try {
  assertMigrationCredentials(process.env);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

const requiredRelations = [
  "public.business_profile", "public.branches", "public.products", "public.stock_movements",
  "public.inventory_stock", "public.sales", "public.sale_items", "public.customer_credit_movements",
  "public.sale_refunds",
];
const requiredFunctions = [
  "public.sync_apply_batch(jsonb,uuid)", "public.sync_apply_product(jsonb,uuid)",
  "public.sync_apply_sale(jsonb,uuid)", "public.refund_sale(uuid,uuid,uuid,uuid,jsonb,jsonb,text)",
];

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
const schemaDriftWarnings = [];
try {
  await client.connect();
  const standardTable = await client.query("SELECT to_regclass('supabase_migrations.schema_migrations')::text AS name");
  const customTable = await client.query("SELECT to_regclass('public._migrations')::text AS name");
  const standardRows = standardTable.rows[0]?.name
    ? (await client.query("SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version")).rows
    : [];
  const customRows = customTable.rows[0]?.name
    ? (await client.query("SELECT version FROM public._migrations ORDER BY version")).rows
    : [];
  if (!standardTable.rows[0]?.name) schemaDriftWarnings.push("supabase_migrations.schema_migrations is missing");
  const state = buildMigrationState(readMigrationFiles(migrationsDir), standardRows, customRows);
  schemaDriftWarnings.push(...state.warnings);
  for (const relation of requiredRelations) {
    const result = await client.query("SELECT to_regclass($1)::text AS name", [relation]);
    if (!result.rows[0]?.name) schemaDriftWarnings.push(`required relation is missing: ${relation}`);
  }
  for (const routine of requiredFunctions) {
    const result = await client.query("SELECT to_regprocedure($1)::text AS name", [routine]);
    if (!result.rows[0]?.name) schemaDriftWarnings.push(`required function is missing: ${routine}`);
  }
  const report = {
    ok: state.complete && schemaDriftWarnings.length === 0,
    expectedMigrations: state.expected.map((migration) => migration.filename),
    actualAppliedMigrations: state.applied.map((migration) => ({ filename: migration.filename, source: migration.source })),
    missingMigrations: state.missing.map((migration) => migration.filename),
    unexpectedMigrations: state.unexpected,
    currentMigrationHead: state.currentHead,
    expectedMigrationHead: state.expectedHead,
    schemaDriftWarnings,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
