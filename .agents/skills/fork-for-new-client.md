---
name: fork-for-new-client
description: Use this when standing up a second client deployment from this codebase. This is the concrete runbook that proves .agents/rules/reusability-and-multi-client.md is actually true, not just aspired to.
---

# Forking StockPadi for a New Client

Per `.agents/rules/reusability-and-multi-client.md`, this should be an afternoon of configuration work, not a rewrite. If any step below turns into a code change rather than a config change, that is a signal the reusability discipline slipped somewhere and needs fixing before continuing, not a reason to push through and fix it "next time."

## 1. Fresh infrastructure, always, never shared

Provision a new VPS for this client, following `.agents/rules/hosting-and-deployment.md`. Do not add the new client to the existing VPS or the existing Supabase instance. Isolation between clients is a locked decision from the original PRD process, not a cost-saving shortcut to skip when it's inconvenient.

## 2. Deploy the same codebase

Fork or branch the repository (decide which based on how much divergence is expected, a fork if this is likely to become a long-lived separate client relationship, a branch if it's closer to a pilot). Point Coolify at the new VPS and the new repository reference.

## 3. Configuration, not code

Set the new client's branding (name, logo, accent color layered on the design tokens), business-type template selection, and fresh environment variables (new Supabase project credentials, new secrets, generated independently, never copied from the first client's `.env`).

## 4. Run migrations against the fresh database

The new client's database starts empty and gets the same versioned migrations as the first deployment, run in order, not a manual schema recreation.

## 5. Onboarding

Walk through the actual onboarding flow (business-type selection, first branch setup, first staff account) as if this were the very first user, on the new deployment, to confirm nothing about the first client's specific data or configuration leaked into what should be a clean template.

## 6. Confirm isolation

Verify the new deployment cannot reach the first client's database, storage, or credentials under any code path, and verify the first client's deployment is entirely unaffected by this one being stood up.

## After the first real fork

Update this file with anything that took longer than expected or required an actual code change rather than configuration. That gap is exactly what `.agents/rules/reusability-and-multi-client.md` asks to be caught and fixed, and the fastest way to catch it is by writing down where this runbook was wrong the first time it was actually followed for real.
