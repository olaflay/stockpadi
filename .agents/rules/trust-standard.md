---
name: trust-standard
description: The ten promises a business owner must be able to rely on, each with the code-level rule, the evidence required to claim it, and the specific way it gets broken. This is the gate that decides whether new work is allowed to start. Binds every human and every agent touching this codebase.
---

# The TRUST Standard

OjàPadi is **not** optimised for feature count. It is optimised for trust.

A business owner runs their shop on this app and stakes their livelihood on the numbers. They do
not care how many features exist. They care whether they can close their book at night and believe
it. Every decision in this repository — what to build, what to cut, what to fix first, what to defer
— is resolved against the ten promises below.

This is not a slogan and not a values statement. Each promise names the rule that enforces it, the
evidence required before anyone may claim it holds, and the concrete way it gets broken in practice.
If a change cannot be checked against one of these ten, the change is out of scope.

## How to use this as a gate

Before starting any work on this codebase, answer three questions in order:

1. **Which promise does this serve?** Name it. If none, do not build it. A change that serves no
   promise is a preference, and preferences do not enter a product whose differentiator is
   correctness.
2. **What is the evidence it holds?** A promise without executed evidence is a wish. "I think it
   works" is never evidence. Point at a file, a function, or a passing test.
3. **What is the tradeoff being refused?** Reliability work is almost always unglamorous. Name the
   feature or the refactor being delayed by doing this properly.

### The precedence rule

> When forced to choose between a new feature and making an existing workflow more reliable,
> **choose reliability.**

This is not advice. It is a gate. A new feature cannot be started while a known reliability defect
in an existing workflow is open and unowned. "Later" is a decision, and this rule says the decision
must be made explicitly, in writing, with the defect named — never by silent omission.

### The evidence standard

- Every claim of the form "X works" must resolve to a file, a function name, or an executed test.
- Every claim of the form "X is safe" must resolve to a test that would **fail** if X broke. A test
  that cannot fail is not evidence.
- Anything unverified is labelled unverified. It is never presented as resolved.
- Findings that could not be executed are surfaced as open decisions, not smoothed over into
  confident prose.

---

## 1. A sale will not disappear

**The rule.** A completed sale on a till is durable the instant it is acknowledged, and survives
power loss, app crash, browser close, and an unbounded offline period. Once the UI tells the owner
"sold," the sale exists somewhere that the app controls.

**Enforced by.** Local write and outbox append committed in one Dexie transaction, never two. See
`.agents/rules/offline-sync-and-ledger.md`. The outbox holds only unacknowledged work by
construction, so a durable outbox row is the durability mechanism, not an optimisation.

**Evidence required.** A test that kills the write path between the sale row and the outbox row and
asserts neither is left behind. A test that an item stranded at `awaitingConfirmation` is recoverable
by a healer or a sweeper rather than being stranded forever.

**Broken by.** Writing the outbox entry in a separate transaction from the domain write. Any code
path that deletes, prunes, or overwrites outbox rows without a server acknowledgement.

---

## 2. A sale will not duplicate

**The rule.** Retrying a sync — from a timeout, a crash, a flaky 2G connection, or a user tapping
the button again — can never produce two sales. Duplication is worse than loss, because it silently
inflates revenue and the owner finds it months later.

**Enforced by.** Client-generated `clientId` / `idempotency_key` on every mutation. The server
treats a replayed key as `skipped`, never as a second insert. Replay must be observable in the
result, not swallowed.

**Evidence required.** A test that applies the same batch twice and asserts the ledger changed
exactly once and the second response reports `skipped`.

**Broken by.** Any server write path that trusts a client-supplied total without recomputing it.
Any client retry that mints a fresh idempotency key instead of reusing the original.

---

## 3. Stock numbers are explainable

**The rule.** Any stock figure can be traced back to the movements that produced it. There is no
mystery shrinkage and no stored mutable quantity that silently disagrees with its own history.

**Enforced by.** The append-only `stock_movements` ledger. Quantity is always computed from
movements. There is no field to hand-edit. This is locked decision 1 in `AGENTS.md`.

**Evidence required.** A test that a given product's computed quantity equals the sum of its
movements. A test that a replayed movement does not double it.

**Broken by.** Introducing any cached or mutable `quantity` column for performance without the
ledger remaining the source of truth. Any migration that recalculates history rather than appending
a correcting movement.

---

## 4. Profit numbers are consistent

**The rule.** A financial figure the app showed yesterday does not silently change today. Every
historical money number is reproducible from stored data with no reference to current configuration.

**Enforced by.** Immutable snapshots captured at the moment of the financial event. `sale_items`
carries the cost it was sold at, not the cost the product happens to have now. Cost rate changes
apply forward and never restate a closed sale; variance posts as a separate current-period entry.

**The current costing decision.** Moving weighted average cost, snapshotted immutably onto each sale
line at sale time. Never recomputed. Permitted under IAS 2 para 25 and 27; LIFO is prohibited under
IAS 2 BC19. Full derivation in `docs/COSTING-AND-PRICING.md`.

**Evidence required.** A test that a sale's gross profit is unchanged after the product's cost is
edited, after the product is soft-deleted, and after a purchase is received. A test that the figure
the till showed equals the figure the server computes.

**Broken by.** Computing any historical money figure from a current lookup. Storing a derived money
value that is recomputed on read from mutable config. Silently substituting a server value for a
client-reported snapshot — that relocates this exact bug rather than fixing it.

---

## 5. Employee actions are traceable

**The rule.** When something goes wrong, the owner can find out who did what and when. No action
that changes money, stock, access, or permissions happens without an attributable record.

**Enforced by.** `audit_logs` writes on every void, stock adjustment, role change, PIN reset, and
any platform-admin action that changes tenant state.

**Evidence required.** A test asserting the audit row is written for each mutating action, with the
actor, the action, the target, and a timestamp.

**Broken by.** Bulk or system-initiated writes that bypass the audit path. Read access with no
attribution at all — see the open decision on auditing platform-admin tenant reads in
`questions.md`.

---

## 6. Offline work will synchronize safely

**The rule.** Work done offline merges in a defined order under a defined rule, and the queue always
drains. Offline is the primary case in this market, not an edge case, so it gets designed for rather
than patched.

**Enforced by.** Per-entity conflict resolution in `.agents/rules/offline-sync-and-ledger.md`:
additive for stock and credit balances, append-only for sales, last-write-wins by field for
catalogue text. A bounded batch that completes inside the client timeout, or the queue cannot drain
and the operator sees a permanently growing counter with no error.

**Evidence required.** Two devices writing concurrently, offline, then reconnecting, with the
result asserted — never a test that only ever exercises one device. A test that a large backlog
drains to empty.

**Broken by.** A batch size that can exceed the request timeout. An unbounded retry that re-sends
the same slice forever. Any path that marks an item acknowledged without a per-item server status
for that item.

---

## 7. Their data will not be lost

**The rule.** Anything the owner enters can be exported by the owner, at any time, without our
permission and without our help. Recovery is a routine operation, not an incident.

**Enforced by.** Local full-database backup and restore. Restore is transactional. Restore refuses
to run while unsynced work exists for the tenant, unless the operator explicitly chooses to discard
a named number of changes. Point-in-time recovery server-side.

**Evidence required.** A round-trip test: export, mutate, restore, assert the pre-mutation state. A
test that restore is refused against a non-empty outbox. A test that a cross-tenant restore is
refused.

**Broken by.** Restoring into a database that still holds newer unacknowledged mutations. Any restore
path where a tenant-scoping check can be bypassed. Backups that have never been restore-tested.

---

## 8. Their business data is isolated from other businesses

**The rule.** One shop can never see, change, or infer another shop's data. This holds at the
database, not only in application code.

**Enforced by.** `business_id` on every core table. Postgres Row Level Security as the actual
enforcement boundary, per `.agents/rules/database-and-rls.md`. The frontend is never a trust
boundary for authorization.

**Evidence required.** A test that tenant A's session cannot read, write, or count tenant B's rows,
exercised against real Postgres with real policies applied, not mocked.

**Broken by.** A query that filters in application code where a policy should filter in the
database. A policy that trusts a client-supplied `business_id`. A new table shipped without its
policies.

---

## 9. The interface will remain understandable as the business grows

**The rule.** The app does not become harder to use as the catalogue, the staff count, and the
branch count grow. One shop with 40 products and one shop with 5,000 products are both usable, and
one branch and six branches are both learnable.

**Enforced by.** Pagination and search on every list. Design system rules in
`.agents/rules/design-system.md` and `.agents/rules/zero-ai-slop-design.md`. One-handed,
thumb-reach layout. Every screen handles empty, loading, offline, error, success, permission-denied,
and no-match states per `.agents/rules/design-system.md`.

**Evidence required.** A performance test at the documented ceiling in
`.agents/rules/performance-and-scalability.md`. Every screen's state matrix either implemented or
explicitly listed as a gap.

**Broken by.** An unbounded list that renders every row. A screen whose meaning depends on having
seen another screen. Copy written for a demo rather than for the person actually standing at the
till.

---

## 10. AI will never silently invent financial truth or execute sensitive actions without authorization

**The rule.** Anything an AI agent or model contributes to this product is either traceable to a
source or clearly marked as generated. No generated figure ever enters a financial record without a
human having chosen it. No model ever performs a privileged action on its own initiative.

**Enforced by.** No generated value is persisted as if it were measured. Anything a model produces
that reaches the owner is attributable and marked. Authorization is checked server-side on every
sensitive action, independent of what the client or the model believed. Any research a model
performs is sourced per `.agents/rules/trusted-tool-finder.md`, never recalled from training data
and presented as fact.

**Evidence required.** A test that a privileged endpoint rejects a request lacking server-side
authorization regardless of what the client asserted. For generated content, a provenance record.

**Broken by.** A model filling a numeric field because it "seemed reasonable". An agent editing a
financial record because the change "looked correct". Any citation that is not a real, retrievable
source.

---

## What this changes in practice

- **Feature proposals now need a promise.** "Users would like X" is not sufficient grounds. "X
  serves promise 6" is.
- **Reliability work is never deferred silently.** It is scheduled explicitly, or it is accepted as
  a known risk in writing with the defect named.
- **Screenshots and architecture diagrams are not evidence.** Executed tests are.
- **Unverified stays unverified.** Confidence is not a substitute for a passing test, and an honest
  "I could not confirm this" is more valuable than a confident guess.
- **Adding an agent later must not weaken this.** Any agent joining this repository inherits all ten
  promises and this evidence standard. A new agent that cannot meet them does not get to touch
  financial or sync code.

## Related

- `AGENTS.md` — locked decisions and the rules index
- `docs/PRD.md` — Section 8.1 carries the same standard as a product requirement
- `docs/LAUNCH_SCOPE.md` — the Must/V1.1/Future boundary this gate protects
- `.agents/rules/offline-sync-and-ledger.md` — promises 1, 2, 3, 6
- `.agents/rules/database-and-rls.md` — promise 8
- `.agents/rules/payment-and-pci-scope.md` — promise 10, authorization boundary
- `.agents/rules/testing-and-qa.md` — promise 4's "evidence required" bar
- `questions.md` — open decisions, kept honest rather than smoothed over