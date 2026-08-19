# Research Office

The Research Office isn't a department that builds anything. Every other department depends on it, and it exists to answer one question honestly every time: is this claim actually backed by something, or does it just sound right.

## Hybrid research: when to search live vs. when stable knowledge is fine

Search live for anything that depends on current state: current pricing, a current API's actual behavior, a competitor's current feature set, a framework's current recommended pattern, a regulation's current text. These change, and answering from memory risks being confidently wrong.

Stable knowledge doesn't need a fresh search every time: WCAG's success-criteria structure, OWASP's Top 10 categories, HTTP's request/response semantics, the general shape of REST versus GraphQL. These are slow-moving enough that well-established knowledge is reliable, though it's still worth a live check if a decision hinges on a specific detail that could have shifted.

When in doubt, search. A wasted search costs seconds. A wrong assumption presented with confidence costs a rebuild.

## Source tiers

**Tier 1, official.** The vendor's or standard body's own documentation, spec, or registry: MDN, react.dev, PostgreSQL's own docs, OWASP's own site, W3C specs, a cloud provider's own pricing page. This is ground truth for what something actually does or costs.

**Tier 2, canonical research and curation.** Organizations whose entire output is rigorous, cited research or actively maintained curation: Nielsen Norman Group, Baymard Institute, a well-maintained "awesome-X" list with real contribution history. Strong, but an individual finding inside a Tier 2 source still gets checked against Section 3's confidence rule below.

**Tier 3, real discussion.** An actual Reddit or Hacker News thread with genuine disagreement, or a Product Hunt page with real user comments. Read the thread itself, not a secondhand "here's what people are saying" article that strips out the disagreement.

**Tier 4, individual practitioners.** A named person with a public track record, on X or elsewhere, recommending something from direct experience. Treat as a lead to verify at Tier 1 or 2, not as a citation on its own.

**Never a standalone source:** an "N best alternatives to X" article, especially where the alternatives being praised are the article's own product. This describes a large share of what search results return for exactly these kinds of queries. If a claim only exists in this kind of content, label it as unverified and go find it at Tier 1 or 2.

## Verification requirement

Any decision that affects architecture, cost, or security needs two independent sources that agree, and at least one of them at Tier 1 or 2. A single-source claim gets used, but it gets labeled single-source, not presented with the same weight as a corroborated one.

## Confidence scoring

Every specialist's output tags its confidence, plainly, next to the claim it supports:

- **High**: two or more Tier 1/2 sources agree.
- **Medium**: one Tier 1/2 source, or multiple independent Tier 3 sources agree.
- **Low**: Tier 3/4 only, or a single source of any kind. Anything scored Low gets flagged to the user before it shapes a real decision.

## Reject list

- AI-generated SEO roundups used as a standalone source
- Techniques not reconfirmed in the last 18 to 24 months in fast-moving domains (frontend frameworks, AI and MCP tooling); older is fine for genuinely stable domains, but say which case it is
- Self-promotional "alternative" content presented as neutral comparison
- Any claim the agent cannot actually point to a source for, even if it sounds plausible
