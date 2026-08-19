# Testing and QA

## What must have a passing automated test before merge, no exceptions

Any change touching `stock_movements`, the delta-merge logic, or anything in `.agents/rules/offline-sync-and-ledger.md`'s scope must ship with a test that simulates two devices writing concurrently and asserts the merged result matches expectations. See `.agents/skills/write-offline-conflict-test.md` for the concrete pattern. A change here that "looks correct" without this test does not merge. Manual QA is not a substitute, the whole point of the ledger design is that the failure mode is silent, a human tester will not notice a lost sale the way an automated assertion will.

Any RLS policy change must ship with a test that authenticates as the relevant role and confirms both the allowed and the denied cases, not just the allowed case. A policy that only gets tested for what it permits has not been tested for what it's supposed to prevent.

## What should have a test but isn't a hard merge gate

UI component rendering, report calculation logic, receipt generation. Use judgment here, but a bug in a report is an inconvenience, a bug in the ledger is a client losing trust in the numbers, the bar is deliberately not the same.

## Real-device testing, not just CI

Before Phase 1 goes live with the first branch, the full offline flow (sale creation, sync on reconnect, conflict scenarios) must be tested on real Android hardware in the 2GB RAM class, on a throttled 2G/3G connection, not just in a desktop browser with devtools network throttling. Devtools throttling does not reproduce real 2G latency and packet loss characteristics closely enough to trust for this specific product's core claim.

## What "done" means for a feature in this codebase

Passing tests exist and have actually been run, not just written. The feature works with the network connection off, not just with it on. If the feature touches stock or credit balance, the conflict test from the first section exists and passes. If the feature adds or changes a screen, the state checklist in `.agents/rules/design-system.md` has been checked against it. Claimed passing needs an actual test run behind it, a description of expected behavior is not the same as verified behavior.
