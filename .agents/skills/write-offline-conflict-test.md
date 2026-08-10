---
name: write-offline-conflict-test
description: Use this whenever a change touches stock_movements, customer credit balance, or any other delta-merged entity, to write the concurrent-write test required before merge by testing-and-qa.md.
---

# Writing the Offline Conflict Test

This is the concrete pattern behind the mandatory test named in `.agents/rules/testing-and-qa.md` and `.agents/rules/offline-sync-and-ledger.md`. If a change touches either of those rule files' scope, it needs a test built this way before it merges.

## The scenario every test in this family simulates

Two devices, both starting from the same synced state, both go offline, both make a change that affects the same entity (most commonly: both sell the last unit of the same product, or both record a payment against the same customer's credit balance), both reconnect and sync in some order.

## The pattern

1. Seed a known starting state (a product with a known stock count, or a customer with a known balance).
2. Simulate device A going offline, performing its action, and queuing the resulting movement locally.
3. Simulate device B, independently, going offline from the same starting state, performing its own action, and queuing its movement locally.
4. Simulate both devices reconnecting and syncing, in each possible order (A then B, and B then A), since order should not change the result for a correctly delta-merged system.
5. Assert the final computed stock or balance reflects both actions applied, not just the last one to sync. This is the actual thing being protected, if only one action's effect survives, the test has caught exactly the bug this whole architecture exists to prevent.
6. Assert no duplicate movement was recorded if either device retries its sync (simulate a dropped connection mid-upload and a retry, confirm the idempotency key prevents double-counting).

## What a passing test does not prove

A test that only checks a single device's write in isolation does not exercise this pattern and does not satisfy the requirement in `.agents/rules/testing-and-qa.md`, however much other coverage exists around it. The concurrent, both-orders scenario above is the actual bar.

## Where these tests live

Group them clearly (a `sync-conflicts` or similarly named test suite) so their presence or absence for a given change is easy to check during review, rather than scattered inside unrelated test files where a reviewer might miss that one was never written.
