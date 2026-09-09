import { db } from "@/lib/db";
import { getSupabase } from "@/lib/supabase";
import { getLocalBusinessId, tenantArray, matchesActiveTenant } from "@/lib/local-tenant";

/**
 * Reconciles local IndexedDB branches against authoritative Postgres branches.
 *
 * If a device was initialized with a client-generated UUID that does not match
 * the Postgres branches table, this reconciler:
 * 1. Pulls authoritative branches from Supabase.
 * 2. Replaces/merges them into db.branches.
 * 3. Rewrites branchId on any pending or failed outbox entries (and local stock movements)
 *    so sync_apply_stock_adjustment will pass tenant_owns_entity() validation.
 */
export async function reconcileLocalBranches(): Promise<{
  reconciled: boolean;
  remoteCount: number;
  repairedOutboxCount: number;
}> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { reconciled: false, remoteCount: 0, repairedOutboxCount: 0 };
  }

  const supabase = getSupabase();
  if (!supabase || typeof supabase.from !== "function") {
    return { reconciled: false, remoteCount: 0, repairedOutboxCount: 0 };
  }

  const activeBusinessId = await getLocalBusinessId();
  if (!activeBusinessId) {
    return { reconciled: false, remoteCount: 0, repairedOutboxCount: 0 };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    return { reconciled: false, remoteCount: 0, repairedOutboxCount: 0 };
  }

  try {
    // 1. Fetch remote branches from Supabase
    const { data: remoteBranches, error } = await supabase
      .from("branches")
      .select("id, name, is_active, business_id")
      .eq("business_id", activeBusinessId)
      .order("name");

    if (error || !remoteBranches || remoteBranches.length === 0) {
      return { reconciled: false, remoteCount: 0, repairedOutboxCount: 0 };
    }

    const localBranches = await tenantArray(db.branches);
    const validRemoteIds = new Set(remoteBranches.map((b) => b.id));
    const staleLocalIds = new Set(
      localBranches.map((b) => b.id).filter((id) => !validRemoteIds.has(id))
    );

    const primaryBranchId = remoteBranches[0].id;

    // 2. Put remote branches in db.branches
    for (const remote of remoteBranches) {
      await db.branches.put({
        id: remote.id,
        name: remote.name,
        isActive: remote.is_active,
        businessId: remote.business_id,
      });
    }

    // 3. Remove stale local-only branches
    for (const staleId of staleLocalIds) {
      await db.branches.delete(staleId);
    }

    let repairedOutboxCount = 0;

    // 4. If there were stale branch IDs, repair pending/failed outbox rows and stock movements
    if (staleLocalIds.size > 0) {
      const outboxItems = await db.outbox.toArray();
      const tenantOutbox = outboxItems.filter(matchesActiveTenant);

      for (const item of tenantOutbox) {
        let changed = false;
        const payload =
          typeof item.payload === "object" && item.payload !== null
            ? { ...(item.payload as Record<string, unknown>) }
            : {};

        if (typeof payload.branchId === "string" && staleLocalIds.has(payload.branchId)) {
          payload.branchId = primaryBranchId;
          changed = true;
        }

        if (changed || item.status === "failed") {
          await db.outbox.update(item.clientId, {
            payload,
            status: "pending",
            lastError: null,
          });
          repairedOutboxCount++;
        }
      }

      // Repair local stock movements that referenced the stale local branch ID
      const movements = await db.stockMovements.toArray();
      for (const m of movements) {
        if (m.businessId === activeBusinessId && staleLocalIds.has(m.branchId)) {
          await db.stockMovements.update(m.id, { branchId: primaryBranchId });
        }
      }
    }

    return {
      reconciled: true,
      remoteCount: remoteBranches.length,
      repairedOutboxCount,
    };
  } catch (err) {
    console.warn("Branch reconciliation deferred:", err);
    return { reconciled: false, remoteCount: 0, repairedOutboxCount: 0 };
  }
}
