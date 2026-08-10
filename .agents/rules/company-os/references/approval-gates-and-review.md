# Approval Gates and Cross-Department Review

## The gates

Nothing moves to the next pipeline stage until its gate closes. Each gate names an owning department, what "pass" means in plain language, and what evidence has to be attached. A gate that closes without evidence attached hasn't actually closed, whatever the conversation implies.

| Gate | Owner | Passes when | Evidence required |
|---|---|---|---|
| Research | Research Office | Findings are cited, cross-checked against 2+ sources, confidence-scored | Source list with tiers and confidence per claim |
| Product | Product | Problem and scope are validated against real evidence, not assumed | Named research sources, not "this seems like a good idea" |
| UX | Design | Flows are grounded in a named precedent, not invented | Which system or research body it's grounded in, per the "receipt" rule |
| Architecture | Backend and Frontend jointly | Choices are justified against the project's stated priority ranking | The tradeoff actually named against speed/cost/scale/etc. |
| Design | Design | Screens pass the zero-ai-slop-design checklist | The checklist itself, run against the screen |
| Security | Security | No open finding above low severity | Findings list, or explicit "none found" with what was checked |
| Accessibility | Accessibility | WCAG AA minimum, verified | What was checked and how, not "should be fine" |
| Testing | QA | Claimed passing has a real test run behind it | The actual test output, not a description of intended tests |
| Deployment | DevOps | A rollback path exists and is named | The specific rollback mechanism |
| Launch | Documentation | Every prior gate is closed and the lessons-learned entry is drafted | The log entry itself |

## Loop-back rule

A failed gate returns to the owning department with the specific objection attached, not a vague "redo this." "The color contrast in the CTA fails WCAG AA at 3.8:1, needs 4.5:1" is a loop-back. "Fix accessibility" is not, and should not be accepted as one.

## Cross-department challenge protocol

A proposal nobody objected to hasn't been reviewed. For any architecture, product-scope, or UI decision of real weight:

1. The owning department proposes, with evidence and confidence attached.
2. A fixed rotation gets a look before it's final: Accessibility and Security review any UI or architecture decision by default, since both hold real vetoes. Product reviews anything that changes scope or cost. QA reviews anything that changes what "done" means for testing.
3. Each reviewing department either signs off or raises a named objection, not a vague concern. "This modal traps keyboard focus" is an objection. "I don't love this" is not.
4. The Orchestrator documents every objection raised and how it was resolved, including objections that were considered and overruled, and why. A decision log with only the winning argument in it isn't a review, it's a summary written after the fact.
5. Security and Accessibility objections cannot be overruled by another department. They can only be resolved by actually fixing the finding, or by the user explicitly accepting the risk with the finding stated plainly first.
