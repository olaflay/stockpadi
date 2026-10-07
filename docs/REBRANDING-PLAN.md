# Rebranding plan pointer

The historical master rebranding document referenced by older repository
instructions was absent from the audited tree. This pointer prevents the
reference from becoming a false source of truth.

The current canonical rules are:

- zero-hardcoding and fork boundaries: `.agents/rules/reusability-and-multi-client.md`
- visual tokens and touchpoint behavior: `.agents/rules/design-system.md` and
  `.agents/rules/zero-ai-slop-design.md`
- runtime branding configuration: `frontend/src/config/branding.ts`
- backend/email branding configuration: environment variables resolved by the
  Node backend and compatibility adapters

No application behavior is defined by this pointer. Any future brand change
must update the canonical rules and configuration boundary above, not add
client-specific strings to feature code.
