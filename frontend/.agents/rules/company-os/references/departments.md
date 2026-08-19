# Departments (Core 10, milestone one)

Each department follows the same shape: its mandate, its mandatory sources (real, named, checkable), what it must always verify before acting, and where its authority ends. "Defers to" names who wins in a genuine conflict, based on real consequence, not seniority theater: Security and Accessibility hold hard vetoes because a shipped vulnerability or an inaccessible product causes real harm; the others inform priority and get resolved through the disagreement protocol, not a title.

---

### Product
**Mandate**: validate the problem and the market before scope gets locked; own the PRD.
**Sources**: Nielsen Norman Group, Baymard Institute, Y Combinator's startup library, public case studies named per project (not invented), and the actual live competitor products relevant to this build, researched fresh, not recalled from memory.
**Always check**: is there already a locked PRD or `AGENTS.md` decision before proposing a scope change.
**Authority**: informs priority; does not override Security or Accessibility hard blocks.

### Design (UX and visual design system)
**Mandate**: turn Product's research into real, non-generic screens.
**Sources**: `zero-ai-slop-design.md` in full (Material Design 3, Apple HIG, Samsung One UI, Meta's design systems), plus Baymard Institute, Nielsen Norman Group, GOV.UK Design System, IBM Carbon, and Shopify Polaris as precedent references under that skill's "every pattern needs a receipt" rule.
**Always check**: `zero-ai-slop-design.md`'s ban list before proposing any pattern, and its checklist before calling a screen done.
**Authority**: can block shipping anything that fails its own ban list without a stated justification.

### Frontend
**Mandate**: implement the design system in code that survives more than one contributor.
**Sources**: MDN, the actual framework's official docs as declared in the project's own `package.json` (React, Next.js, or whatever is actually there, not assumed), TypeScript's own docs, W3C specs, Chrome for Developers.
**Always check**: what's actually in the manifest file before assuming a stack.
**Defers to**: Accessibility and Security on anything they hard-block.

### Backend
**Mandate**: a data model, API, and business logic that don't need a rewrite at 10x scale.
**Sources**: the project's actual framework docs, PostgreSQL or Redis (or whichever the repo actually uses) official docs, REST and GraphQL specs, the relevant cloud provider's own docs, RFCs for anything protocol-level.
**Always check**: locked integration decisions in `AGENTS.md` (a locked payment provider, a locked auth approach) before proposing an alternative. This is the exact class of conflict already flagged once in COMPr and the Prompt Optimizer's Stripe-versus-Flutterwave history; that pattern doesn't repeat silently again.

### QA
**Mandate**: prove it works, not just that it compiled.
**Sources**: the project's own test suite and coverage reports, the testing framework's official docs, real entries from the actual issue tracker.
**Always check**: whether a claimed "passing" gate has a real test run behind it or is just an assertion someone wrote down.

### Security
**Mandate**: the department with a real, unconditional veto.
**Sources**: OWASP (Top 10 and ASVS), NIST guidelines, the CVE database, CIS Benchmarks, MITRE ATT&CK for anything infrastructure-facing.
**Authority**: can hard-block, unconditionally, on any demonstrable vulnerability. The escalation path is telling the user the specific finding directly, never silently blocking without explanation.

### DevOps
**Mandate**: it deploys, it's monitored, and it can be rolled back.
**Sources**: Docker's own docs, the actual cloud provider in use (AWS, Azure, Cloudflare, or Vercel, whichever is locked for this project), Terraform docs if infrastructure-as-code is in play, GitHub Actions docs for CI/CD.

### AI
**Mandate**: LLM, agent, and MCP integration grounded in documented behavior, not marketing claims about what a model can do.
**Sources**: Anthropic's own documentation and the Model Context Protocol spec, OpenAI's docs where relevant, published evaluations rather than vendor claims.
**Always check**: defers entirely to `trusted-tool-finder.md` for any tool, repo, or MCP server research; that work doesn't get duplicated here.

### Accessibility
**Mandate**: the other department with a real, unconditional veto.
**Sources**: WCAG (2.2 as the floor; check live whether a newer version status has changed, since this does move), the W3C WAI patterns library, and the relevant platform's own accessibility guidelines (Apple's, Android's).
**Authority**: can hard-block on any WCAG AA failure, verified, not assumed.

### Documentation
**Mandate**: what shipped and why is written down somewhere a future session can actually find it.
**Sources**: the project's own `AGENTS.md` and `.agents/rules/` conventions, and the Divio documentation system (tutorial, how-to, reference, explanation) as the structural model, since it's a real, citable framework rather than an invented one.
**Always**: appends the dated entry to `.agents/memory/lessons-learned.md` at the close of every milestone. This is its actual job, not an optional nicety; see `skill-gap-and-learning.md`.
