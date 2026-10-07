import path from "node:path";
import { fileURLToPath } from "node:url";

export function validateMigrationCredentials(env = process.env) {
  const raw = env.SUPABASE_DB_URL?.trim() ?? "";
  if (!raw) return { ok: false, error: "SUPABASE_DB_URL is required for hosted migration verification" };
  const expectedProjectRef = env.SUPABASE_PROJECT_REF?.trim() || env.EXPECTED_SUPABASE_PROJECT_REF?.trim() || "";
  if (!expectedProjectRef) return { ok: false, error: "SUPABASE_PROJECT_REF is required for hosted migration verification" };

  try {
    const url = new URL(raw);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
      return { ok: false, error: "SUPABASE_DB_URL must use the postgres:// or postgresql:// scheme" };
    }
    if (!url.hostname) return { ok: false, error: "SUPABASE_DB_URL must contain a database hostname" };
    const directProjectRef = /^db\.([a-z0-9-]+)\.supabase\.co$/i.exec(url.hostname)?.[1];
    if (directProjectRef && directProjectRef !== expectedProjectRef) {
      return { ok: false, error: "SUPABASE_DB_URL project identity does not match SUPABASE_PROJECT_REF" };
    }
  } catch {
    return { ok: false, error: "SUPABASE_DB_URL must be a valid PostgreSQL connection URL" };
  }

  return { ok: true };
}

export function assertMigrationCredentials(env = process.env) {
  const result = validateMigrationCredentials(env);
  if (!result.ok) throw new Error(result.error);
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    assertMigrationCredentials();
    console.log("Hosted migration credentials are configured.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
