# Lessons learned

## 2026-11-02 — Future-scope portfolio review

- A feature appearing in a competitor is evidence that the workflow exists, not evidence that this
  product's merchants will pay for it. Unvalidated differentiators remain experiments with entry and
  kill criteria.
- Operational controls that protect stock, cash, recovery, attribution, and multi-branch movement
  outrank speculative platform expansion under the TRUST precedence rule.
- Vague roadmap labels such as “advanced integrations”, “AI copilot”, and “business health score”
  are not schedulable requirements and create scope drift. Remove them until a named merchant
  problem and measurable acceptance test exist.
- The payment-method-as-tag boundary is a deliberate risk and product decision. Live payment
  processing cannot remain as an innocent-looking future bullet because it implies a different PCI,
  support, reconciliation, and failure model.
- Keep a written removed-items record and re-entry rule. Silent deletion makes the same rejected
  ideas likely to return under new wording.
- Reject unsafe mechanics, not necessarily the user outcome. Voice can return as a confirmed draft,
  AI as source-citing read-only retrieval, forecasting as explicit deterministic scenarios, and
  biometrics as platform-held passkey verification. The original dangerous form remains prohibited.

## 2026-11-03 — Operational UX counter-research

- Counter-research should first locate the capability already present. OjàPadi already had truthful
  save/upload states, stock-count variance review, and recovery UI; rebuilding them would have
  created competing sources of truth.
- A success message must describe the completed domain effect, but live upload state belongs to the
  live global indicator. Freezing “uploaded” inside a toast can become false seconds later.
- A broad consistency initiative can be riskier than the inconsistency it aims to remove. Pilot a
  new feedback standard on one connected workflow, execute ledger and accessibility evidence, then
  decide separately whether it deserves wider adoption.
- Colour reinforces financial meaning but cannot carry it. Debt and payment states also require
  explicit wording and signs that remain understandable without colour perception.

## 2026-11-03 — Offline navigation and adaptive scanning

- An offline guard that only intercepts anchors cannot protect controls that call `router.push()`.
  Navigation controls must remain real links so offline document fallback, accessibility, and
  browser navigation semantics all share one path.
- Automatic link prefetch plus eager full-route warming can compete with the route a user actually
  requested on constrained connections. Background warming must be low priority, idle-time,
  sequential, and connection-aware.
- Camera resolution alone is not a scanner performance strategy. Decode formats, decode cadence,
  frame rate, RAM/CPU signals, camera focus capability, expected decode errors, and background-tab
  shutdown all affect low-end device responsiveness.
- Capability constraints should be `ideal`, not `exact`, so old or poor cameras can negotiate a
  supported stream rather than failing because they cannot meet a preferred profile.
## 2026-11-09: Offline and sync reliability audit
Worked: Compared the existing protocol against browser, PostgreSQL, Supabase, Vercel and OWASP primary sources before changing architecture; Research and Backend owned it.
Caught: Emergency quota recovery could delete the current offline shell, and unit tests were being treated as installed-PWA proof; Security and QA caught these at their gates.
Change: Default to version-aware cache cleanup and require browser/device plus restore evidence before marking offline or recovery behavior verified.
