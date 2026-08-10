---
name: zero-ai-slop-design
description: Enforces a non-generic, systems-grounded visual, interaction, and copy standard for any UI work (web, PWA, or mobile) by drawing real constraints from Material Design 3, Apple HIG/Liquid Glass, Samsung One UI, and Meta's family of design systems, instead of default AI-generated aesthetics or AI-generated prose. Use this whenever building or reviewing screens, components, design tokens, UI copy, a design-system.md, or any .agents/rules/ file for a product; whenever the user asks for something to look "clean," "premium," "native," or "not AI-generated"; and always before writing UI code or copy so the output is judged against a real system's rules, not vibes.
---

# Zero AI-Slop Design

Most AI-generated UI is recognizable at a glance: a purple-to-blue gradient hero, a glassmorphism card with no reason to be glass, Inter set at default weights, emoji standing in for icons, a "01 / 02 / 03" step row for content that isn't actually sequential, and a dark theme that's just the light theme with colors inverted. None of that is a style choice. It's the absence of one. This skill exists to replace "vibes" with the actual, documented rules four production design systems use, and to fail a build that doesn't pick one of them on purpose.

The rule underneath everything here: **borrow constraints, not surface**. A gradient hero isn't wrong because it's a gradient. It's wrong when nothing about the product's actual content, platform, or user justifies it. Every section below gives you what to check before you accept a design decision, whether that decision is visual or written.

---

## 1. Ban list, visual: reject these on sight

An agent or reviewer should flag any of the following unless the person building explicitly argues for it and states why:

- Purple-to-blue (or teal-to-violet) gradient as the default hero/CTA treatment, with no content reason for it
- Glassmorphism / frosted-blur cards used as decoration rather than as a functional layer over live content
- Inter, or any default system sans, used unpaired and unmodified because it's "safe"
- Emoji used as functional icons (status, navigation, actions) instead of a real icon set
- Numbered markers (01 / 02 / 03) applied to content that has no real, load-bearing order
- Border-radius applied uniformly everywhere with no shape *system* (no logic for which elements get how much rounding)
- Dark mode implemented as an inverted color filter rather than its own set of surface/elevation tokens
- Box-shadow stacks used to fake depth instead of an explicit elevation scale
- Animation added for polish rather than tied to a real state change (loading, success, dismissal, focus)
- Hardcoded hex/px values in components instead of named tokens

If a screen has three or more of these, it reads as AI-generated regardless of how "polished" it looks. That's the actual failure mode to design against, not aesthetics in the abstract.

---

## 2. Ban list, copy: kill the AI writing tells

The same "recognizable at a glance" problem exists in text as in visuals. Any agent generating UI copy, marketing copy, PRD prose, or documentation for these products should treat the following as bugs, not style:

- **Em dashes used to fake a sentence break.** Use a period, a comma, a colon, or a semicolon, or just write two sentences. If a sentence needs an em dash to hold together, it's two sentences.
- **Stock intensifiers that mean nothing on inspection**: seamless, elevate, unlock, empower, robust, cutting-edge, game-changing, revolutionize, supercharge, leverage (as a verb meaning "use"), dive in, unleash, frictionless.
- **The "it's not just X, it's Y" construction**, and its relatives ("this isn't about X, it's about Y").
- **Forced tricolon rhythm**: "fast, flexible, and free," "simple, powerful, and secure." Real products aren't always describable in exactly three adjectives. Don't force the rhythm because it sounds authoritative.
- **Colon-heavy listicle copy** where every line restates its own label ("Speed: it's fast. Reliability: it's reliable.").
- **Opening filler**: "Great question," "Certainly," "I'd be happy to help," or restating the heading in the first sentence beneath it.
- **Title Case Forced Onto Every Heading** regardless of house style. Pick sentence case or title case once, per product, and hold it everywhere.
- **Hedge-stacking**: "might potentially," "could possibly help." Say the thing directly, or cut it.
- **Emoji used as sentence punctuation or paragraph decoration**, distinct from the icon ban in Section 1.

The test: read the copy out loud. If it sounds like something a careful person would actually say to a colleague, keep it. If it sounds like a keynote slide or a listicle, rewrite it as plain, direct sentences of varied length.

---

## 3. The four references, and what they actually constrain

Don't reach for these systems for their "look." Each one encodes hard-won answers to a specific problem. Pull the *problem-solving logic*, then style it for the product at hand.

### Material Design 3 (M3 / M3 Expressive), Google
**What it's actually for:** cross-platform, data-dense, personalizable software where the interface needs to scale from a watch face to a desktop app without breaking.
- **Type scale**: five roles (Display, Headline, Title, Body, Label), each in Small/Medium/Large. Pick roles by function (Display for a hero number, Label for a chip), never by "this looks big enough."
- **Shape system**: a graduated roundedness scale from square to fully rounded, with shape used to *communicate state* (a shape that morphs when a component is pressed or selected), not decoration.
- **Motion**: token-based and physics-driven, split into spatial tokens (things that move or resize) and effects tokens (things that change color or opacity). Motion should always map to one of these two categories. If it's neither, it's decoration, and it should be cut.
- **Color**: a dynamic, tonal system derived from a small set of seed colors, not a flat palette of hand-picked hexes.
- **Use this when:** the product is Android-first, a cross-platform web app, or needs real per-user theming (a tool with lots of dense data and states: dashboards, editors, admin panels).

### Apple HIG / Liquid Glass, Apple
**What it's actually for:** content-first, single-purpose native or native-feeling apps where restraint and hierarchy matter more than density.
- **Three founding principles**: Clarity (legible, purposeful elements), Deference (UI recedes so content leads), Depth (layering communicates hierarchy).
- **Type**: one neutral system typeface (SF Pro) with a Dynamic Type scale. Body text sits at 17pt, Large Title at 34pt by default. Every size step exists to support real hierarchy, not to make things "a bit bigger."
- **Touch targets**: 44x44pt minimum, non-negotiable.
- **Liquid Glass (current, 2025 to 2026)**: a translucent material used for *controls that float above content*, not for content itself. Its rules: hierarchy is communicated through depth (transparency, refraction) rather than through color or size alone; shapes stay rounded to match device hardware geometry; the material adapts dynamically to what's behind it (more opaque over busy content, more transparent over calm content).
- **Use this when:** the product should feel premium, minimal, and content-first, with a single clear task per screen and few simultaneous options.

### Samsung One UI, Samsung
**What it's actually for:** one-handed, mobile-first, physically comfortable use across a huge range of screen sizes (phone to foldable to tablet).
- **Four principles**: focus on the task at hand (short, uninterrupted journeys); interact naturally (screen split into a top *viewing* area and a bottom *interaction* area, so controls stay within thumb reach); be visibly comfortable (dark mode, high-contrast keyboard, adjustable type, built for real eyes in real light rather than dark mode as pure aesthetic); make things responsive (layout and even feature availability adapt to device and screen size, not just breakpoints).
- **Focus blocks**: card containers with large, deliberate corner radii used specifically to pull the eye to the one thing that matters on a screen, not applied to every card indiscriminately.
- **Use this when:** the product is mobile-first, will be used one-handed, or needs to work identically well on a cheap Android phone and a large-screen device. This is the system to lead with for anything optimized for thumb reach.

### Meta's family of design systems (FDS, IGDS, Messenger DS, WhatsApp DS)
**What it's actually for:** Meta doesn't run one public unified system the way Google or Apple do. It runs 20+ product-specific systems, because Facebook, Instagram, Messenger, and WhatsApp each need their own identity. What's consistent across all of them, and worth borrowing directly, is the *engineering discipline behind accessibility and reach* at global scale:
- Designs must hold up with text overflow and full right-to-left layout support, not just LTR with padding to spare
- WCAG-compliant contrast is a hard requirement, not a nice-to-have pass at the end
- Explicit design for **data-lite experiences**: interfaces that stay usable for people on limited data plans and lower-end devices
- Tokens for color, type, and spacing are treated as the actual source of truth engineering builds from, not a Figma file that drifts from the code
- **Use this when:** the product is social, community, or marketplace-shaped, or the target user is on a budget device with an inconsistent connection. This is the one most directly relevant to any product built for a Nigerian, data-cost-sensitive, Android-majority market.

---

## 4. Picking a lead system (don't blend all four evenly)

Blending all four systems' surface style into one UI *is itself a slop pattern*. It reads as indecisive. Pick one system to lead, and pull specific, named ideas from the others only where there's a concrete reason.

| Product shape | Lead system | Borrow from |
|---|---|---|
| Desktop/web tool, dense controls, prompt/parameter tuning (e.g. a prompt optimizer) | M3, type scale plus tonal color for state-heavy UI | HIG's Clarity principle for any single-focus screens (e.g. a results view) |
| Mobile-first PWA for a cost- and data-sensitive market (e.g. media compression before sharing) | Samsung One UI, top-viewing/bottom-interaction split for one-handed use | Meta's data-lite discipline; the UI must stay legible and fast on a low-end Android device on a weak connection |
| Campus/community marketplace PWA | Meta's accessibility and data-lite discipline first, since the product *is* social/marketplace-shaped | Samsung One UI for reachability on the browse/chat flows |
| B2B operational SaaS for safety-critical equipment | M3 for the dense, stateful data views | HIG's Clarity/Deference for anything decision-critical; status, alerts, and confirmations should never compete visually with chrome |

State the choice explicitly in the product's `design-system.md` or `AGENTS.md` ("this product leads with One UI's reachability model, borrows M3's tonal color") so every future screen gets judged against a named standard instead of re-litigated each time.

---

## 5. Every pattern needs a receipt: no invented mechanics

Don't invent a new interaction pattern, layout convention, or copy pattern and present it as good design because it seemed clever in the moment. Anything proposed as a UI pattern needs to trace back to something real that has actually shipped and been tested at scale. Acceptable receipts:

- Any of the four systems in Section 3 (M3, Apple HIG, Samsung One UI, Meta's design systems)
- Published research from a recognized usability body (Nielsen Norman Group, Baymard Institute, GOV.UK Design System)
- A named product from a firm known for disciplined, tested UI (Stripe, Airbnb, Linear, Notion, Duolingo, and similar) where the pattern is publicly visible and can be pointed to directly

If an agent proposes something with no traceable precedent, that is allowed, but it must be labeled explicitly as experimental ("no precedent found, this is a novel proposal, test before committing") rather than presented with the same confidence as a proven pattern. Confident invention dressed up as best practice is exactly how slop happens, not just in gradients and fonts, but in interaction logic nobody has actually validated with real users.

This mirrors the standing rule already governing this workflow: evidence-based claims only. It applies to design decisions exactly as much as it applies to code or product claims.

---

## 6. The actual checklist before shipping a screen

1. **Name the lead system** this screen follows, in a comment or the PR description.
2. **Type**: does every text element map to a named role in that system's type scale? No ad hoc font sizes.
3. **Color**: are values pulled from named tokens (`color.surface.container`, not `#F4F1EA`)? Is contrast checked against WCAG AA, not eyeballed?
4. **Shape**: is corner radius applied by a rule (focus blocks get large radius, inline chips get small), not uniformly?
5. **Depth**: is elevation/layering done with a defined scale (shadow tokens or a translucency system), not stacked box-shadows?
6. **Motion**: does every animation map to a real state change? If you can't name the state it communicates, cut it.
7. **Reach**: on mobile, are primary actions inside comfortable thumb range (bottom third of the screen)?
8. **Bandwidth**: if the target user may be on a weak connection or low-end device, does the screen degrade gracefully, with no blocking on heavy assets and no layout that only works with a fast first paint?
9. **Functional copy**: does every label describe what the person controls, in their language, not implementation language ("Save changes," not "Submit")?
10. **AI writing tells**: does any generated text hit one of the Section 2 tells (em dashes, stock intensifiers, forced tricolons, hedge-stacking)? Read it aloud before shipping it.
11. **Precedent**: does every proposed pattern have a named receipt from Section 5, or is it explicitly flagged as experimental?
12. **The 3-strike gut check**: run the screen against the Section 1 ban list. Three or more hits means stop and redesign, not polish.

---

## 7. How to drop this into a PRD-driven workflow

- Save this file as `.agents/rules/zero-ai-slop-design.md` alongside the product's existing `design-system.md`. It complements a token file; it doesn't replace one.
- In `AGENTS.md`, add one line naming the lead system per product, per the table in Section 4, so agents don't re-derive it per session.
- Treat Section 6's checklist as a gate: any generated screen or copy block that hasn't been checked against it isn't done, the same way a locked payment-provider decision isn't optional to silently override.
- If a product's `AGENTS.md` and this file ever disagree (a locked design decision contradicts a rule here), surface the conflict instead of resolving it silently, the same standing rule as everything else in the `.agents/rules/` folder.
