# Reports

Daily/weekly/monthly, per-branch and consolidated: sales total, profit estimate, expenses, purchases, best sellers, low stock. No worst-sellers view exists yet, despite older phrasing here suggesting otherwise. See `.agents/skills/add-new-report.md` before adding a new report.

## Considered and skipped: TanStack Table

A dense-grid library (TanStack Table) was researched as a general refactor candidate for this screen, but this screen renders as One UI card lists (a total block, a best-sellers list, a low-stock list), not a tabular grid, by deliberate design per `.agents/rules/design-system.md`'s mobile-first, one-handed layout. Introducing a table component here would be solving a display-density problem this screen doesn't have. If a genuinely dense, sortable, filterable sales ledger view gets built for the tablet/desktop "owner's desk" case `design-system.md` describes, TanStack Table is the right tool then, headless, so it won't fight the token system, see `.agents/rules/trusted-tool-finder.md`.
