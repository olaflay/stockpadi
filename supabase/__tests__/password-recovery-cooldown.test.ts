import { afterAll, beforeAll, expect, it } from "vitest";
import { type PGlite } from "@electric-sql/pglite";
import { bootDatabase } from "./_harness.js";

let db: PGlite;
const emailHash = "a".repeat(64);
const claim = async () => (await db.query<{ allowed: boolean }>(
  "select public.claim_password_recovery_request($1) as allowed", [emailHash],
)).rows[0].allowed;

beforeAll(async () => {
  db = (await bootDatabase()).pg;
});
afterAll(async () => { await db?.close(); });

it("permits only one request per address during cooldown, then allows a fresh request", async () => {
  await db.exec("set role service_role");
  try {
    expect(await Promise.all([claim(), claim()])).toEqual([true, false]);
    await expect(db.query("select * from public.password_recovery_requests")).rejects.toThrow(/permission denied/);
  } finally {
    await db.exec("reset role");
  }
  await db.exec("update public.password_recovery_requests set retry_after = now() - interval '1 second'");
  expect(await claim()).toBe(true);
});

it("rejects direct cooldown access by unauthenticated and authenticated app users", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    try {
      await expect(claim()).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  }
});
