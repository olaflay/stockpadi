# Reusability for Future Client Deployments

## The rule

This is currently a single-client build, but it is architected to become a repeatable template. A second client deployment must be achievable as a fork, a fresh Vercel project, a fresh Supabase Cloud project, and a config file, not a code rewrite. Three things stay strictly out of the core codebase and inside per-deployment configuration:

1. **Branding.** Business name, logo, color accents layered on top of the design tokens in `.agents/rules/design-system.md`. The design tokens themselves (the One UI structure, the type scale, the spacing system) do not change per client, only the branding layer on top of them does.
2. **Business-type defaults.** The category, expiry-tracking, and field defaults set by the business-type template a client picks during onboarding. See `.agents/skills/add-business-type-template.md` for how to add a new one without hardcoding it into feature logic.
3. **Environment-specific credentials.** Database connection strings, Supabase service keys, and environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). These must be configured per client using **Method 1 (Separate Whitelabel Builds)**:
   - Each client receives a dedicated Vercel project (e.g. `shop-a.stockpadi.com` and `shop-b.stockpadi.com`) running their own build/deploy.
   - This ensures 100% data security/isolation, simplifies DNS caching, and removes database handshake roundtrips at startup. Credentials live strictly in Vercel-managed environment variables, never committed to version control.

## What this rule catches in practice

If a change hardcodes this specific client's business name, branch names, or category list anywhere in component code rather than reading it from configuration, that is a violation of this rule even if it works correctly for the current client. It will break silently the first time this codebase gets forked for someone else, and the person doing that fork may not be the person who wrote the original hardcoded value.

## The actual test

Before this rule is considered honored, not just aspired to, write and follow the deployment runbook in `.agents/skills/fork-for-new-client.md` once, for real, even if there is no second client yet. If standing up a second instance from this codebase takes more than an afternoon of configuration work, the reusability goal has not actually been met, regardless of how clean the code looks.

## What this rule does not require

This does not mean every feature needs to be built generically for hypothetical future clients before it's needed for the real one. Build what this client needs. The discipline is about where configuration lives, not about speculative feature-building for businesses that don't exist yet.
