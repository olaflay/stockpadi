---
name: trusted-tool-finder
description: Identifies what a codebase actually needs (design references, MCP servers, API clients, dev tooling, AI agent skills) and researches free or open-source options against a ranked trust hierarchy of sources, never a single blog post. Use this whenever the user asks for free tools, free alternatives to a paid product, MCP servers, Claude/Antigravity skills, or GitHub repos to solve a specific need; whenever a PRD or AGENTS.md references a paid tool that might have a viable free option; and always before recommending any external tool, repo, or skill so the recommendation is sourced and dated, not assumed.
---

# Trusted Tool Finder

Most "best free alternatives" content on the internet is written by the alternative's own marketing team. A search for a free Mobbin alternative mostly returns blog posts from InspoAI, VP0, and Watobu about themselves. That is not research, it is advertising with a neutral headline. This skill exists to separate the two, and to keep every recommendation traceable back to a real source instead of a confident guess.

Two failure modes to avoid equally: inventing a tool or feature that sounds plausible, and repeating a marketing claim as if it were independent verification. Both are hallucination. The fix for both is the same: cite where the claim came from, and rank that source honestly.

---

## 1. Trust hierarchy (rank every source before you use it)

**Tier 1, official.** The project's own registry or docs: `registry.modelcontextprotocol.io` for MCP servers, a vendor's own pricing/docs page, `npmjs.com` or `pypi.org` listing pages, GitHub's own topic pages. Treat this as ground truth for what a tool actually does and what its free tier actually includes.

**Tier 2, canonical community lists.** Curated, actively maintained "awesome-X" repositories with real contribution history, for example `sindresorhus/awesome` (the master index of every other awesome list), `modelcontextprotocol/servers` (Anthropic-managed reference implementations), or a best-of list that ranks entries by an automated quality score rather than a single author's opinion. These are strong but still need the Section 2 vetting pass on any individual entry before you recommend it.

**Tier 3, real discussion threads.** An actual Reddit thread (r/webdev, r/SaaS, r/ClaudeAI, r/programming) or Hacker News thread with genuine back-and-forth and visible disagreement, or a Product Hunt page with real user comments. Read the thread itself, not a "here's what Reddit says" SEO article that summarizes it secondhand; those summaries drop the disagreement and caveats that make the thread useful in the first place.

**Tier 4, individual practitioners on X or elsewhere.** A named person with a public track record recommending something from experience. Treat this as a lead worth checking against Tier 1 or 2, not as a standalone citation.

**Never treat as a source on its own:** an "N best alternatives to [paid product]" article, especially when several of the "alternatives" are the article's own product. This describes a large share of what search results return for exactly this kind of query. If a claim only appears in this kind of article, say so explicitly and go verify it at Tier 1 or 2 before repeating it.

---

## 2. Vetting checklist for any specific repo or tool

Before recommending a specific GitHub repo, MCP server, or skill, check:

- **Recent activity**: commits in the last few months, not just a big initial commit followed by silence
- **Tagged releases**: a library with fresh commits but no tagged release in 180+ days is not production-ready, commits are work in progress, releases are the actual contract
- **Contributor spread**: more than one real contributor. A repo where one account made 90% of recent commits is effectively unmaintained the moment that person stops
- **Fork-to-star ratio**: legitimate projects typically see forks land somewhere around 10 to 30 percent of their star count; a ratio under 1 percent alongside a huge star count is a signal of inflated or purchased stars, not organic adoption
- **License file present and unambiguous**: no placeholder text, no mismatched name in the license header
- **Issue and PR activity**: real bug reports and real responses. Thousands of stars with zero open issues is itself suspicious
- **What it actually installs**: for anything you'll run locally, glance at `package.json` scripts, `setup.py`, or install scripts before running them; this is where malicious behavior actually hides, not usually in the main source

None of these alone is disqualifying. Together they separate an actively used tool from an abandoned or inflated one.

---

## 3. Identifying what the codebase actually needs

Before searching for anything, look at what's already there:

- Read `package.json` / `pubspec.yaml` / `requirements.txt` / `pyproject.toml` for the actual stack, don't assume it
- Read `AGENTS.md`, the PRD, and any `.agents/rules/` files for stated tools, locked decisions, and known gaps or conflicts (a paid tool referenced in one place and a different one locked elsewhere is exactly the kind of thing worth flagging, not silently resolving)
- Scan for repeated friction: TODOs, workaround comments, or manual steps in a README that suggest a real, current need rather than a hypothetical one
- Only then map that need to a category (API client, design reference, MCP server, monitoring, database GUI, AI agent skill) and go to Section 4 or run fresh searches against the Section 1 hierarchy

Don't research a tool nobody asked for because it showed up in an unrelated list. The trigger is a real, named gap in this specific codebase.

---

## 4. Dated starting points (verify before relying on any of these)

These are current as of August 2026 and were checked against Section 2 at the time of writing. Re-verify anything here that's more than a few months old; this category moves fast enough that a six-month-old list is not a safe source on its own.

**AI agent skills and Claude Code plugins.** Start at Tier 1: Anthropic's own skills documentation and repo. For community skills, `ComposioHQ/awesome-claude-skills`, `travisvn/awesome-claude-skills`, and `mingrath/awesome-claude-skills` are actively maintained curated indexes. Hard rule regardless of source: skills can execute arbitrary code in your environment. Only install from a source you've actually vetted with Section 2, never because a list included it.

**MCP servers.** `registry.modelcontextprotocol.io` is the official metaregistry backed by Anthropic, GitHub, and PulseMCP; it hosts metadata and points to the real package, not the code itself. `github.com/modelcontextprotocol/servers` holds Anthropic-managed reference implementations. Below that, `wong2/awesome-mcp-servers` and `tolkonepiu/best-of-mcp-servers` (ranks entries by an automated quality score computed from GitHub and package-manager activity) are the strongest community curation layers. Still run Section 2 on any individual server before connecting it to anything real, especially anything with file or database access.

**Free API client (Postman alternative).** Bruno is the option that shows up consistently across independent write-ups: open source, git-native collections, no forced cloud sync. Hoppscotch and Yaak come up as the next most-recommended free, open-source options. `stepci/awesome-api-clients` is a maintained list that filters for a real bar (200+ stars, 2+ contributors) rather than including everything.

**Free UI/design-reference tools (the Mobbin category).** This category is the clearest example of Section 1's "never treat as a source on its own" rule: most of what ranks for "free Mobbin alternative" is the alternative's own content marketing. Cross-check any specific claim (screenshot count, what's actually free vs. gated) against the tool's own pricing page, and weight a Product Hunt page's real user comments over any single blog post ranking "best alternatives."

**General free dev stack.** VS Code, Supabase (open-source Firebase alternative, fits your Flutterwave-and-PWA stack better than a closed platform), DBeaver, and Sentry's free tier show up independently across multiple 2026 roundups that don't share an author, which is a genuine (if soft) signal of real consensus rather than one writer's opinion echoed everywhere.

---

## 5. Output discipline

- Never state a tool is free, or has a specific feature, without having actually found that claim in a Tier 1 or Tier 2 source during this session. If you can't verify it, say "unverified, found only in a marketing-style source" rather than dropping the caveat.
- Name the source type next to every recommendation (official docs, community awesome-list, real Reddit thread, vendor's own marketing) so the person can weight it themselves instead of trusting your summary blind.
- One line per recommendation: what it does, why it's the pick, the one real caveat. No stacked adjectives, no "game-changing," no marketing voice, per the copy rules in the zero-ai-slop-design skill.
- If a category is dominated by self-promotional content (design-reference tools are the clearest current example), say that plainly instead of presenting the top search result as neutral fact.

---

## 6. How to drop this into a PRD-driven workflow

- Save as `.agents/rules/trusted-tool-finder.md`, alongside `zero-ai-slop-design.md` and the product's `design-system.md`.
- When an agent hits a real gap (needs an MCP server, a free design reference, a testing tool), it should run this skill's process before proposing a new dependency, the same way it checks `AGENTS.md` before touching a locked decision.
- If a recommendation conflicts with something already locked in a product's `AGENTS.md` (a payment provider, a stack choice), surface the conflict instead of silently proposing a swap. Same standing rule as everything else in `.agents/rules/`.
