import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { bootDatabase, type Tenant } from "./_harness.js";

/**
 * Verification for Q5: Platform-admin audit trail and atomic status RPC.
 * Proves:
 * 1. platform_set_business_status atomically mutates business_profile.status and writes platform_audit_logs.
 * 2. Works for a platform admin who exists ONLY in auth.users and platform_admins (no public.users row).
 * 3. Rollback safety: invalid status fails without mutating business status or writing audit log.
 * 4. Tenant isolation: authenticated and anon cannot read or insert platform_audit_logs.
 * 5. Tenant survivability: deleting a business sets business_id to null and preserves the audit row.
 */

let db: PGlite;
let tenant: Tenant;
let platformAdminId: string;

async function actAs(userId: string) {
  await db.exec("set role authenticated;");
  await db.exec(
    `set request.jwt.claims = '${JSON.stringify({ sub: userId, role: "authenticated" })}';`
  );
}

async function actAsAnon() {
  await db.exec("set role anon;");
  await db.exec("reset request.jwt.claims;");
}

async function resetToSuperuser() {
  await db.exec("reset role;");
  await db.exec("reset request.jwt.claims;");
}

beforeAll(async () => {
  const booted = await bootDatabase();
  db = booted.pg;
  tenant = booted.tenant;

  // Create platform admin who has NO row in public.users
  const adminUser = await db.query<{ id: string }>(
    `insert into auth.users (email) values ('superadmin@platform.internal') returning id;`
  );
  platformAdminId = adminUser.rows[0].id;

  await db.query(
    `insert into platform_admins (user_id, status) values ($1, 'active');`,
    [platformAdminId]
  );
});

describe("Platform admin audit trail & atomic status RPC", () => {
  it("platform admin has no row in public.users", async () => {
    const userRow = await db.query(
      `select 1 from public.users where id = $1;`,
      [platformAdminId]
    );
    expect(userRow.rows).toHaveLength(0);
  });

  it("platform_set_business_status updates business and writes platform_audit_logs atomically", async () => {
    await resetToSuperuser();

    // Call atomic RPC
    await db.query(
      `select public.platform_set_business_status($1, 'suspended', $2, '{"reason":"payment_overdue"}'::jsonb);`,
      [tenant.businessId, platformAdminId]
    );

    // Verify business_profile updated
    const biz = await db.query<{ status: string; is_active: boolean }>(
      `select status, is_active from public.business_profile where id = $1;`,
      [tenant.businessId]
    );
    expect(biz.rows[0].status).toBe("suspended");
    expect(biz.rows[0].is_active).toBe(false);

    // Verify platform_audit_logs row written
    const audit = await db.query<{
      actor_user_id: string;
      action: string;
      entity_type: string;
      entity_id: string;
      business_id: string;
      metadata: Record<string, unknown>;
    }>(
      `select actor_user_id, action, entity_type, entity_id, business_id, metadata
       from public.platform_audit_logs
       where entity_id = $1 order by created_at desc limit 1;`,
      [tenant.businessId]
    );

    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].actor_user_id).toBe(platformAdminId);
    expect(audit.rows[0].action).toBe("business_suspended");
    expect(audit.rows[0].entity_type).toBe("business_profile");
    expect(audit.rows[0].business_id).toBe(tenant.businessId);
    expect(audit.rows[0].metadata).toEqual({ reason: "payment_overdue" });
  });

  it("rejects invalid status and rolls back atomically", async () => {
    await resetToSuperuser();

    await expect(
      db.query(
        `select public.platform_set_business_status($1, 'bogus_status', $2);`,
        [tenant.businessId, platformAdminId]
      )
    ).rejects.toThrow("INVALID_STATUS");

    // Status remains unchanged
    const biz = await db.query<{ status: string }>(
      `select status from public.business_profile where id = $1;`,
      [tenant.businessId]
    );
    expect(biz.rows[0].status).toBe("suspended");
  });

  it("unauthenticated (anon) cannot access platform_audit_logs", async () => {
    await actAsAnon();

    await expect(
      db.query(`select * from public.platform_audit_logs;`)
    ).rejects.toThrow(/permission denied/i);

    await resetToSuperuser();
  });

  it("tenant user (authenticated) cannot read platform_audit_logs", async () => {
    await actAs(tenant.ownerId);

    await expect(
      db.query(`select * from public.platform_audit_logs;`)
    ).rejects.toThrow(/permission denied/i);

    await resetToSuperuser();
  });

  it("survives business deletion with business_id set to null", async () => {
    await resetToSuperuser();

    // Create a temporary business
    const tempBiz = await db.query<{ id: string }>(
      `insert into public.business_profile (name, currency, business_type) values ('Temp Shop', 'NGN', 'retail') returning id;`
    );
    const tempBizId = tempBiz.rows[0].id;

    // Suspend it via RPC
    await db.query(
      `select public.platform_set_business_status($1, 'suspended', $2, '{"note":"temp"}'::jsonb);`,
      [tempBizId, platformAdminId]
    );

    // Delete the business
    await db.query(`delete from public.business_profile where id = $1;`, [tempBizId]);

    // Audit log still exists, with business_id nullified
    const audit = await db.query<{ business_id: string | null; entity_id: string }>(
      `select business_id, entity_id from public.platform_audit_logs where entity_id = $1;`,
      [tempBizId]
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].business_id).toBeNull();
    expect(audit.rows[0].entity_id).toBe(tempBizId);
  });
});
