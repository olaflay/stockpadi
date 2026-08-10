# Offline Sync and the Stock Ledger

This is the single most important rule in this codebase. Everything else here can be relaxed with a conversation. This one cannot, because the failure mode it prevents (silent overselling, silent shrinkage, a client who stops trusting the numbers) is expensive to notice and worse to explain.

## The rule

Stock quantity and customer credit balance are never stored as a mutable field that gets overwritten. They are always computed by summing an append-only `stock_movements` ledger. If you find yourself writing `UPDATE inventory_stock SET quantity = quantity - 1` anywhere outside the ledger-write path itself, stop. That is the exact bug this rule exists to prevent.

Why this matters concretely: two cashiers at the same branch can both sell the last unit of an item while offline. Both sales are legitimate and both must be honored when the devices reconnect. A system that stores "current quantity" and lets each device overwrite it will silently lose one of those two sales. A system that stores every change as a signed delta and sums them never loses either one, it just produces a negative stock number that the owner can see and act on. Negative stock is a visible, honest signal. A silently wrong positive number is not.

## Conflict resolution, per entity, not one rule for everything

| Entity | Rule | Reasoning |
|---|---|---|
| Stock quantity | Delta merge via `stock_movements`, never overwritten | Two offline sales of the same item must both be honored |
| Customer credit balance | Delta merge, same mechanism as stock | Same overselling/overstating risk if treated as an absolute value |
| Sales and sale line items | Append-only, immutable once created. No edit path exists after creation, only a void (online-only) | Removes the conflict entirely, nothing to merge if it never changes |
| Product name, price, description | Last-write-wins by field, with a version counter. Show a "changed while you were offline" notice if the version on sync differs from the version the device started with | Low stakes if a stale edit is lost, does not justify ledger-level complexity |
| New product or new customer created offline | Allowed. Use a client-generated UUID, never a server-assigned sequential ID, to avoid collisions on sync | Collision risk is low at this transaction volume, restricting this the way some competitors do would hurt daily usability for no real benefit here |
| Refund or void | Online-only. Disabled in the UI while offline, not merely discouraged | Adopted directly from how Loyverse and Square both treat this exact operation |

## What every stock-affecting feature must do

Any code path that changes stock (a sale, a purchase receipt, a manual adjustment, a future stock transfer) must write a row to `stock_movements` with a signed quantity, a source reference (which sale, purchase, or adjustment caused it), a timestamp, and the device ID that generated it. Nothing writes directly to a computed stock total. If `inventory_stock` is implemented as a materialized view or a trigger-maintained aggregate, that implementation detail can change, the rule that nothing bypasses the ledger cannot.

## Before merging any change that touches this path

See `.agents/skills/write-offline-conflict-test.md`. A change here without a passing two-device concurrent-write test does not merge, regardless of how confident the change looks in isolation.

## If asked to change this

If a request would require treating stock or credit balance as a mutable, overwritable value (for speed, for simplicity, for "just this once"), surface the tradeoff explicitly before writing any code. Do not silently comply and do not silently refuse, name the risk and get confirmation.
