# Performance and Scalability Standards

This document establishes the architecture and coding conventions for maintaining instant rendering speed (sub-50ms transitions, sub-5ms rendering times) when handling large data sets (e.g., 5,000+ products, sales history, and expense ledgers) in our offline-first PWA.

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
