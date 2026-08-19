---
name: add-stock-movement-type
description: Use this when adding any new source of stock change, a new adjustment reason code, a new sale type, a future stock transfer between branches, so it correctly writes to the ledger instead of touching a computed total directly.
---

# Adding a New Stock Movement Type

Read `.agents/rules/offline-sync-and-ledger.md` in full before starting. This skill is the concrete procedure for staying inside that rule while adding something new.

## Step 1: Confirm it belongs in the ledger, not somewhere else

If the new operation changes how much stock exists at a branch, in either direction, it belongs here. If it only changes something descriptive about a product (name, price, category), it does not, that goes through the last-write-wins path in the same rule file instead.

## Step 2: Define the movement

Every new movement type needs: a clear signed quantity direction (does this add stock or remove it, never ambiguous), a source reference (which sale, purchase, adjustment, or transfer generated it), a reason code if it's a manual adjustment (never a free-text-only reason with no code, reasons need to be reportable later), and a device ID for offline provenance.

## Step 3: Write to `stock_movements`, never to a computed total

The new code path inserts a row into `stock_movements`. It does not update `inventory_stock` directly, that table (or view) is always derived by summing movements, never hand-set. If the new feature seems to require updating a stored quantity directly to work, that is a sign the feature needs a movement type it doesn't have yet, not an exception to the rule.

## Step 4: Decide its offline behavior explicitly

State plainly whether this new operation is allowed offline or requires connectivity, the way refunds and voids are explicitly online-only. Don't leave this implicit, an operation with no stated offline policy will get built assuming "offline is fine" by default, which is not always true (see the reasoning in `.agents/rules/offline-sync-and-ledger.md` for why refunds specifically are excluded).

## Step 5: Test it

Follow `.agents/skills/write-offline-conflict-test.md`. A new movement type ships with a concurrent-write test proving two devices generating this movement type simultaneously produce the correct summed result, not just that a single device's write looks right in isolation.
