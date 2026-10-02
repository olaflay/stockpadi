import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

/**
 * Boots a real Postgres engine (pglite: Postgres compiled to WASM) and applies
 * every shipped migration verbatim, in filename order, so a defect test fails
 * the moment production SQL drifts from what it claims to verify.
 *
 * Supabase's `auth` schema and API roles do not exist in plain Postgres, so a
 * minimal stand-in is created here. It plays no part in the assertions: the
 * sync_apply_* functions are called directly with an explicit actor_id, the
 * same way the sync-push Edge Function calls them after authorizing the caller
 * independently.
 */

const migrationsDir = fileURLToPath(new URL("../migrations/", import.meta.url));

export function allMigrationFilenames(): string[] {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

export function readMigration(filename: string): string {
  return readFileSync(`${migrationsDir}${filename}`, "utf8");
}

export interface Tenant {
  businessId: string;
  branchId: string;
  productId: string;
  ownerId: string;
  workerId: string;
}

export async function bootDatabase(): Promise<{ pg: PGlite; tenant: Tenant }> {
  const pg = new PGlite({ extensions: { pgcrypto } });

  await pg.exec(`create schema if not exists auth;`);
  await pg.exec(
    `create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);`
  );
  await pg.exec(`
    create or replace function auth.uid() returns uuid as $$
      select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid
    $$ language sql stable;
  `);
  await pg.exec(`
    do $$ begin
      if not exists (select from pg_roles where rolname = 'anon') then create role anon; end if;
      if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
      if not exists (select from pg_roles where rolname = 'service_role') then create role service_role; end if;
    end $$;
  `);

  // Reproduce the project-level default privileges Supabase installs on a new
  // project, BEFORE any migration runs, so that a migration which narrows access
  // with an explicit revoke still wins. Setting these as default privileges
  // rather than a blanket post-migration grant matters: a blanket grant would
  // silently undo those revokes and make the harness more permissive than the
  // database it is supposed to model.
  //
  // Without this, `authenticated` holds no table privileges at all, any policy
  // whose expression reads another table fails with "permission denied" instead
  // of evaluating, and a test can pass or fail for a reason production never has.
  await pg.exec(`grant usage on schema public to anon, authenticated, service_role;`);
  await pg.exec(`alter default privileges in schema public grant all on tables to authenticated;`);
  await pg.exec(`alter default privileges in schema public grant all on tables to service_role;`);

  for (const filename of allMigrationFilenames()) {
    await pg.exec(readMigration(filename));
  }

  return { pg, tenant: await seedTenant(pg) };
}

/** An owner-capable tenant with one branch, one product and opening stock. */
async function seedTenant(pg: PGlite): Promise<Tenant> {
  const owner = await pg.query<{ id: string }>(`insert into auth.users default values returning id;`);
  const ownerId = owner.rows[0].id;

  // Provision through the production function rather than hand-writing the four
  // rows, so the owner, the membership and the primary branch are created by the
  // same code path the app uses and are held to the same constraints.
  //
  // This is not cosmetic. auth_account_type() resolves the caller's account from
  // business_memberships joined to a business_profile whose status is 'verified'.
  // A seed that inserts only into `users`, or that leaves the business 'pending',
  // yields an owner that resolves to no account type at all, and every RLS
  // assertion made as that owner then passes or fails for the wrong reason.
  const provisioned = await pg.query<{ provision_business_owner: string }>(
    `select public.provision_business_owner($1, $2, $3, $4) as provision_business_owner;`,
    [ownerId, "Repro Owner", "Repro", "general_retail"]
  );
  const businessId = provisioned.rows[0].provision_business_owner;

  // Stand in for platform activation, which is the step that promotes a business
  // from 'pending' to 'verified' and makes the membership resolvable.
  await pg.query(`update public.business_profile set status = 'verified' where id = $1;`, [businessId]);

  const branch = await pg.query<{ id: string }>(
    `select id from branches where business_id = $1 order by created_at limit 1;`,
    [businessId]
  );
  const branchId = branch.rows[0].id;

  const product = await pg.query<{ id: string }>(
    `insert into products (business_id, sku, name, cost_price, sell_price)
     values ($1, 'SKU-1', 'Widget', 100, 150) returning id;`,
    [businessId]
  );
  const productId = product.rows[0].id;

  await pg.query(
    `insert into stock_movements (client_id, business_id, branch_id, product_id, quantity_delta, source, created_at_local, created_by_user_id)
     values (gen_random_uuid(), $1, $2, $3, 100, 'initial_stock', now(), $4);`,
    [businessId, branchId, productId, ownerId]
  );

  return { businessId, branchId, productId, ownerId, workerId: "" };
}

/**
 * Adds an active WORKER with SUBMIT_STOCK_COUNT and branch access, which is the
 * only account shape sync_apply_stock_count accepts.
 */
export async function seedCountableWorker(
  pg: PGlite,
  tenant: Tenant
): Promise<string> {
  const worker = await pg.query<{ id: string }>(`insert into auth.users default values returning id;`);
  const workerId = worker.rows[0].id;

  await pg.query(
    `insert into users (id, business_id, full_name, role, account_type)
     values ($1, $2, 'Repro Worker', 'inventory_staff', 'WORKER');`,
    [workerId, tenant.businessId]
  );
  await pg.query(
    `insert into business_memberships (user_id, business_id, account_type, status)
     values ($1, $2, 'WORKER', 'active');`,
    [workerId, tenant.businessId]
  );
  await pg.query(
    `insert into user_branches (user_id, business_id, branch_id) values ($1, $2, $3);`,
    [workerId, tenant.businessId, tenant.branchId]
  );
  await pg.query(
    `insert into worker_permissions (user_id, business_id, permission, enabled)
     values ($1, $2, 'SUBMIT_STOCK_COUNT', true);`,
    [workerId, tenant.businessId]
  );

  return workerId;
}

/** The quantity a pull would return for this product/branch projection. */
export async function rollupQuantity(
  pg: PGlite,
  productId: string,
  branchId: string
): Promise<number | null> {
  const result = await pg.query<{ quantity: number | null }>(
    `select quantity from inventory_stock_rollup where product_id = $1 and branch_id = $2;`,
    [productId, branchId]
  );
  return result.rows[0]?.quantity ?? null;
}

/**
 * The rollup row's updated_at as epoch milliseconds, which is what an
 * incremental pull cursors on. Returned as a number rather than a Date so
 * assertions compare values, not object identity.
 */
export async function rollupUpdatedAt(
  pg: PGlite,
  productId: string,
  branchId: string
): Promise<number | null> {
  const result = await pg.query<{ updated_at: Date | string | null }>(
    `select updated_at from inventory_stock_rollup where product_id = $1 and branch_id = $2;`,
    [productId, branchId]
  );
  const raw = result.rows[0]?.updated_at;
  if (raw == null) return null;
  return raw instanceof Date ? raw.getTime() : Date.parse(String(raw));
}

export async function countRows(pg: PGlite, sql: string): Promise<number> {
  const result = await pg.query<{ n: number }>(sql);
  return result.rows[0].n;
}