import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { bootDatabase, type Tenant } from "./_harness.js";

let db: PGlite;
let tenant: Tenant;
let adminId: string;

beforeAll(async () => {
  const booted = await bootDatabase();
  db = booted.pg;
  tenant = booted.tenant;
  const admin = await db.query<{ id: string }>(`insert into auth.users (email) values ('admin@test.local') returning id`);
  adminId = admin.rows[0].id;
  await db.query(`insert into public.platform_admins (user_id, status) values ($1, 'active')`, [adminId]);
});

describe("platform business soft deletion", () => {
  it("blocks the owner, preserves records, audits the action, and restores the original status", async () => {
    const before = await db.query<{ products: string; movements: string }>(
      `select (select count(*) from products where business_id=$1)::text as products,
        (select count(*) from stock_movements where business_id=$1)::text as movements`, [tenant.businessId],
    );
    await db.query(`select public.platform_soft_delete_business($1, $2)`, [tenant.businessId, adminId]);
    const deleted = await db.query<{ status: string; is_active: boolean; deleted_at: string }>(
      `select status, is_active, deleted_at from business_profile where id=$1`, [tenant.businessId],
    );
    expect(deleted.rows[0]).toMatchObject({ status: "suspended", is_active: false });
    expect(deleted.rows[0].deleted_at).toBeTruthy();
    const ownerContext = await db.query(`select * from public.resolve_account_context($1, false)`, [tenant.ownerId]);
    expect(ownerContext.rows).toHaveLength(0);
    await expect(db.query(`select public.platform_soft_delete_business($1, $2)`, [tenant.businessId, adminId]))
      .rejects.toThrow("BUSINESS_ALREADY_DELETED");

    const after = await db.query<{ products: string; movements: string }>(
      `select (select count(*) from products where business_id=$1)::text as products,
        (select count(*) from stock_movements where business_id=$1)::text as movements`, [tenant.businessId],
    );
    expect(after.rows).toEqual(before.rows);
    const audit = await db.query<{ action: string; metadata: Record<string, unknown> }>(
      `select action, metadata from platform_audit_logs where entity_id=$1 order by created_at desc limit 1`, [tenant.businessId],
    );
    expect(audit.rows[0]).toMatchObject({ action: "business_soft_deleted", metadata: { records_preserved: true } });

    await db.query(`select public.platform_restore_business($1, $2)`, [tenant.businessId, adminId]);
    const restored = await db.query<{ status: string; is_active: boolean; deleted_at: string | null }>(
      `select status, is_active, deleted_at from business_profile where id=$1`, [tenant.businessId],
    );
    expect(restored.rows[0]).toEqual({ status: "verified", is_active: true, deleted_at: null });
  });

  it("rejects a missing business without writing an audit row", async () => {
    const before = await db.query(`select id from platform_audit_logs where action='business_soft_deleted'`);
    await expect(db.query(`select public.platform_soft_delete_business(gen_random_uuid(), $1)`, [adminId]))
      .rejects.toThrow("BUSINESS_NOT_FOUND");
    const audit = await db.query(`select 1 from platform_audit_logs where action='business_soft_deleted'`);
    expect(audit.rows).toHaveLength(before.rows.length);
  });
});
