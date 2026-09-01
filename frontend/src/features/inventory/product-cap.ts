import { db } from "@/lib/db";
import { tenantArray } from "@/lib/local-tenant";
import { PRODUCT_CAP, PRODUCT_CAP_WARN_AT } from "@/config/limits";

export type ProductCapStatus = "ok" | "warn" | "blocked";

/**
 * Live count of products this device holds for the active business. Used to
 * enforce the per-business product cap at creation time and to surface usage.
 */
export async function countActiveProducts(): Promise<number> {
  return (await tenantArray(db.products)).length;
}

/**
 * Reports where a projected product count sits relative to the cap. Pass the
 * count AFTER the write(s) the caller is about to perform (current usage plus
 * however many it is adding). "warn" means it crossed the 85% heads-up line
 * but is still under the cap; "blocked" means it would exceed the cap, so the
 * caller must not proceed. Checked BEFORE any real write so nothing is created
 * then rolled back.
 */
export function productCapStatusFor(projectedCount: number): ProductCapStatus {
  if (projectedCount > PRODUCT_CAP) return "blocked";
  if (projectedCount > PRODUCT_CAP_WARN_AT) return "warn";
  return "ok";
}
