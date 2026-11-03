# Performance and Scalability Standards

This document establishes architecture and coding conventions for keeping local interactions responsive with large data sets (for example, 5,000+ products). Synthetic sub-50ms query/write checks are CI regression signals, not proof of transition, render, cold-launch, memory, radio, or storage performance on a target phone. Installed-device readiness uses the separate PRD budget and named-hardware field evidence.

## Core Rules

1. **Never Render Unbounded Lists Directly**
   * Any page that displays database records (such as product catalogs, sales, restocks, debtors, and expenses) must implement **Incremental Rendering** (Infinite Scroll) instead of rendering the whole array directly.
   * Always load a default of `50` items first and use an `IntersectionObserver` on a bottom container element to incrementally append `50` more at a time.
   * Never let React render thousands of list nodes at once, which blocks the browser's main thread and freezes page transitions.

2. **Debounce User Search and Filtering Inputs**
   * Text inputs that trigger real-time search queries or list filtering must be debounced by **120ms to 150ms** (using the `useDebounce` hook).
   * This separates the local input field state (which updates instantly on keypress) from the filtering list state (which updates on a delay), keeping typing fluid and responsive.

3. **Database-Level Sorting & Index Queries**
   * Leverage database indexes (defined in `db.ts`) for querying and sorting (e.g. `.orderBy("name")`) instead of querying raw arrays and sorting in JavaScript memory.
   * Limit initial database query sizes where appropriate (e.g. using `.limit(100)`) on autocomplete inputs or search results.

4. **Avoid Server-Side Rendering Hydration Bloat**
   * All pages are client-only and read from local IndexedDB (via Dexie). During development compilation, Next.js pre-renders client components on the Node server.
   * Ensure database reads do not block initial SSR HTML generation. Let the components render default/skeleton states during hydration, and load from IndexedDB once mounted.
