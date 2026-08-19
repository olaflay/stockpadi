# Inventory

Products, categories, units (including optional alt-unit selling, e.g. piece + carton), stock adjustments, and per-branch stock levels. `Product.brandId` exists in the type but is unused — always `null`, no `brands` table, no management UI — a stub for a feature that was never built, not something to read as implemented.

Stock is never read from or written to a mutable "current quantity" field. It is always computed from `stock_movements`. See `.agents/rules/offline-sync-and-ledger.md` before touching anything here.
