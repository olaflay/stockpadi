import { db, type LocalBranch } from "@/lib/db";
import { withLocalBusinessId } from "@/lib/local-tenant";
import { enqueueOutboxWrite } from "@/features/sync/enqueue-outbox-write";

export async function writeBranchOffline(branch: LocalBranch): Promise<void> {
  const now = new Date().toISOString();
  const payload = { id: branch.id, name: branch.name, isActive: branch.isActive, isPrimary: branch.isPrimary === true, updatedAt: now };
  await db.transaction("rw", db.branches, db.outbox, async () => {
    await db.branches.put(await withLocalBusinessId({ ...branch, isPrimary: branch.isPrimary === true }));
    await enqueueOutboxWrite(branch.id, "branch", await withLocalBusinessId(payload), now, { entityId: branch.id });
  });
}

export async function setPrimaryBranchOffline(branch: LocalBranch, branches: LocalBranch[]): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction("rw", [db.branches, db.outbox], async () => {
    for (const candidate of branches) await db.branches.put(await withLocalBusinessId({ ...candidate, isPrimary: candidate.id === branch.id }));
    await enqueueOutboxWrite(branch.id, "branch", await withLocalBusinessId({ ...branch, isPrimary: true, updatedAt: now }), now, { entityId: branch.id });
  });
}
