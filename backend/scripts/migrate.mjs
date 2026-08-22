import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbUrl = process.env.SUPABASE_DB_URL;

if (!dbUrl) {
  console.error('ERROR: SUPABASE_DB_URL is missing in environment.');
  process.exit(1);
}

const migrationsDir = path.resolve(__dirname, '../../supabase/migrations');

if (!fs.existsSync(migrationsDir)) {
  console.error(`ERROR: Migrations directory not found at ${migrationsDir}`);
  process.exit(1);
}

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

async function runMigrations() {
  try {
    await client.connect();
    console.log('Connected to Supabase PostgreSQL database.');

    // Ensure tracking schema/table exists
    await client.query(`CREATE SCHEMA IF NOT EXISTS supabase_migrations;`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
        version TEXT PRIMARY KEY,
        statements TEXT[],
        name TEXT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS public._migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    const { rows: supabaseRows } = await client.query(`SELECT version FROM supabase_migrations.schema_migrations`);
    const { rows: publicRows } = await client.query(`SELECT version FROM public._migrations`);

    const appliedVersions = new Set([
      ...supabaseRows.map(r => r.version),
      ...publicRows.map(r => r.version)
    ]);

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`Found ${files.length} migration files in total.`);
    console.log(`Already applied ${appliedVersions.size} migration(s).`);

    let count = 0;
    for (const file of files) {
      // Extract version prefix (e.g. "20260807054724" or full file name)
      const version = file.split('_')[0];

      if (appliedVersions.has(version) || appliedVersions.has(file)) {
        console.log(`[SKIP] Already applied: ${file}`);
        continue;
      }

      console.log(`[APPLYING] ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(`INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [version, file]);
        await client.query(`INSERT INTO public._migrations (version) VALUES ($1) ON CONFLICT DO NOTHING`, [file]);
        await client.query('COMMIT');
        console.log(`[SUCCESS] Applied ${file}`);
        count++;
      } catch (err) {
        await client.query('ROLLBACK');

        // Handle case where migration statement was already partially applied / exists
        if (err.code === '42710' || err.code === '42P07' || err.message.includes('already exists')) {
          console.warn(`[NOTICE] Object already exists in DB for ${file}, marking as applied.`);
          await client.query(`INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [version, file]);
          await client.query(`INSERT INTO public._migrations (version) VALUES ($1) ON CONFLICT DO NOTHING`, [file]);
          count++;
          continue;
        }

        console.error(`[FAILURE] Error applying ${file}:`, err.message);
        throw err;
      }
    }

    console.log(`\n🎉 Migration complete! ${count} new migration(s) processed.`);
  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();
