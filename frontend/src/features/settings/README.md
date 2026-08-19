# Settings

Business profile, branch management, Worker account management, business-type template selection, and appearance (light/dark/system, see `ThemeProvider.tsx`). Writes go straight to Dexie (`db.businessProfile`, `db.branches`, ...), same as every other feature. `src/config` (`branding.ts`, `business-types.ts`) supplies static, per-deployment defaults and templates that screens here read from — it is not a write path — so business-specific values still never get hardcoded into component code.
