import { Pool } from 'pg';

let pool: Pool | undefined;

export function getPool(): Pool {
  if (pool) return pool;

  // Supabase connection pooling string should be provided via process.env.SUPABASE_DB_URL
  pool = new Pool({
    connectionString: process.env.SUPABASE_DB_URL,
    max: 10, // maximum number of clients in the pool per server instance
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  return pool;
}
