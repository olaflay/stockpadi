import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(new URL("../migrations/20261010120000_harden_sync_realtime_topic_authorization.sql", import.meta.url));
const migration = readFileSync(migrationPath, "utf8");

describe("sync Realtime authorization migration", () => {
  it("uses authoritative membership, lifecycle, branch, and capability checks", () => {
    expect(migration).toContain("public.auth_account_type()");
    expect(migration).toContain("public.auth_can_access_business(v_business_id)");
    expect(migration).toContain("public.auth_can_access_branch(v_business_id, v_branch_id)");
    expect(migration).toContain("u.is_active = true");
    expect(migration).toContain("public.auth_worker_has_capability('VIEW_PRODUCTS')");
    expect(migration).not.toContain("u.role in ('owner', 'manager', 'accountant', 'admin')");
  });

  it("does not expose an authenticated publish path", () => {
    expect(migration).toContain("revoke insert on realtime.messages from anon, authenticated");
    expect(migration).toContain("for select");
    expect(migration).not.toMatch(/create policy\s+sync_.*publish/i);
  });
});
