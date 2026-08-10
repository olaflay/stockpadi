---
name: add-business-type-template
description: Use this when adding a new business-type default (a retail vertical beyond Grocery, Pharmacy, Electronics, or General Retail) to the onboarding configuration, without hardcoding it into feature logic.
---

# Adding a New Business-Type Template

## Where this lives

Business-type defaults are configuration data, a template defining default categories, whether expiry/batch tracking is on by default, and any other vertical-specific defaults, read by the onboarding flow and by feature code that needs to know the current business's type. Per `.agents/rules/coding-standards-and-api.md`, this is never a scattered set of `if (businessType === 'x')` checks through component code.

## Adding one

1. Define the new template's defaults: default category list, expiry/batch tracking on or off by default, any other vertical-specific field defaults (serial number relevance for electronics, for example).
2. Add it to the configuration source, not as a new code branch, as a new data entry alongside the existing four templates (Grocery/Supermarket, Pharmacy/FMCG, Electronics/Accessories, General Retail).
3. Confirm the onboarding screen picks it up automatically from the configuration list, it should not need a code change to the onboarding UI itself to show a new option, only a change to the underlying template data.

## What this is not for

This is for setting sensible defaults, not for hard restrictions. A pharmacy business type defaulting to expiry tracking on does not mean a grocery business type is prevented from turning expiry tracking on too, defaults are a starting point the owner can change, not a permanent category lock.

## Test

Confirm a business created with the new template shows the correct default categories and tracking settings immediately after onboarding, and confirm an existing business's data is entirely unaffected by adding a new template, since templates only apply at the point a business is set up.
