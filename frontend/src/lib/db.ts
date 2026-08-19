import Dexie, { type EntityTable } from "dexie";
import type { StockMovement } from "@/types/stock-movement";
import type { Sale } from "@/types/sale";
import type { SyncQueueItem } from "@/types/sync";
import type { Product } from "@/types/product";
import type { Role } from "@/types/roles";
import type { Expense } from "@/types/expense";
import type { Supplier, Purchase } from "@/types/purchase";

/**
 * Local-first store. Every screen reads from here and renders immediately;
 * network is only ever a source of fresher data, never a blocker on first render.
 * See .agents/skills/scaffold-new-screen.md.
 *
 * Mirrors the server schema's shape: products and customers are business-wide
 * (no branch scoping on the row itself), stock and credit balance are never
 * stored as a mutable field, only ever computed from their movement ledgers.
 * See .agents/rules/offline-sync-and-ledger.md and
 * .agents/rules/database-and-rls.md.
 */

export interface LocalBranch {
  id: string;
  businessId?: string;
  name: string;
  isActive: boolean;
}

export const BUSINESS_PROFILE_SINGLETON_ID = "singleton";

export interface LocalBusinessProfile {
  id: typeof BUSINESS_PROFILE_SINGLETON_ID;
  businessId?: string;
  name: string;
  businessTypeId: string;
  currency: string;
  /**
   * The owner's own WhatsApp number, set once in Settings. Close-day
   * summaries share here directly instead of dumping the owner into
   * WhatsApp's contact picker every night. See src/lib/whatsapp.ts and
   * docs/RESEARCH-AND-PLAN.md Section 4.4. Optional: existing profiles
   * created before this field existed simply have it undefined.
   */
  whatsappNumber?: string | null;
}

export interface LocalCategory {
  id: string;
  businessId?: string;
  name: string;
}

export interface LocalCustomer {
  id: string;
  businessId?: string;
  name: string;
  phone: string | null;
  updatedAt: string;
}

export interface CustomerCreditMovement {
  id: string;
  businessId?: string;
  clientId: string;
  customerId: string;
  amountDelta: number;
  sourceReferenceId: string | null;
  createdAtLocal: string;
  createdByUserId: string;
}

/**
 * Cached mirror of the server account context, per-device, for local identity
 * and session rendering. It is never an authorization source.
 */
export interface LocalUser {
  id: string;
  businessId?: string;
  fullName: string;
  role: Role;
  accountType?: "ADMIN" | "BUSINESS_OWNER" | "WORKER";
  isActive: boolean;
  updatedAt: string;
  /**
   * True once the owner has confirmed their email via a verification code.
   * Staff users are never email-verified (they don't own the store account).
   * Synced from users.email_verified on login and after successful verification.
   * See supabase/functions/verify-email/index.ts and
   * src/features/auth/EmailVerificationBanner.tsx.
   */
  emailVerified?: boolean;
}

export const SESSION_SINGLETON_ID = "current";

/**
 * "Am I logged in on this device" cache, checked by (app)/layout.tsx before
 * rendering any authenticated screen. expiresAt is the 30-day no-server-
 * contact bound from PRD Section 10.3; past it, the device must go through
 * the normal /login route again.
 */
export interface LocalSession {
  id: typeof SESSION_SINGLETON_ID;
  userId: string;
  deviceId: string;
  expiresAt: string;
}

/**
 * Local mirror of `audit_logs`, written by the same actions that write the
 * server row (worker changes, password resets, stock adjustments, voids) so Staff &
 * Access has something to render offline. See .agents/rules/database-and-rls.md.
 */
export interface LocalAuditLog {
  id: string;
  businessId?: string;
  clientId: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  beforeState: unknown;
  afterState: unknown;
  createdAtLocal: string;
}

class StockPadiDB extends Dexie {
  businessProfile!: EntityTable<LocalBusinessProfile, "id">;
  branches!: EntityTable<LocalBranch, "id">;
  products!: EntityTable<Product, "id">;
  categories!: EntityTable<LocalCategory, "id">;
  customers!: EntityTable<LocalCustomer, "id">;
  customerCreditMovements!: EntityTable<CustomerCreditMovement, "id">;
  stockMovements!: EntityTable<StockMovement, "id">;
  sales!: EntityTable<Sale, "id">;
  outbox!: EntityTable<SyncQueueItem, "clientId">;
  localUsers!: EntityTable<LocalUser, "id">;
  session!: EntityTable<LocalSession, "id">;
  auditLogs!: EntityTable<LocalAuditLog, "id">;
  expenses!: EntityTable<Expense, "id">;
  suppliers!: EntityTable<Supplier, "id">;
  purchases!: EntityTable<Purchase, "id">;

  constructor() {
    super("stockpadi");

    this.version(1).stores({
      businessProfile: "id",
      branches: "id, name",
      products: "id, name, sku, barcode, categoryId, updatedAt",
      categories: "id, name",
      customers: "id, name, phone, updatedAt",
      customerCreditMovements: "id, clientId, customerId, createdAtLocal",
      stockMovements: "id, clientId, branchId, productId, createdAtLocal",
      sales: "id, clientId, branchId, customerId, createdAtLocal",
      outbox: "clientId, type, status, createdAtLocal",
    });

    // Additive only: real auth (docs/RESEARCH-AND-PLAN.md Phase 2 item 14).
    // No existing rows change shape, so no upgrade() is needed.
    this.version(2).stores({
      localUsers: "id, role",
      session: "id",
      auditLogs: "id, clientId, actorUserId, entityType, createdAtLocal",
    });

    // Additive only: expenses (docs/RESEARCH-AND-PLAN.md Phase 3 item 21).
    this.version(3).stores({
      expenses: "id, branchId, category, createdAtLocal",
    });

    // Additive only: purchases/restocking (docs/RESEARCH-AND-PLAN.md Phase 3 item 22).
    this.version(4).stores({
      suppliers: "id, name",
      purchases: "id, clientId, branchId, supplierId, createdAtLocal",
    });

    // Same store shape as version 4, but with a data migration: products
    // created before the Units feature landed (docs/RESEARCH-AND-PLAN.md
    // Phase 3 item 20) have no unitLabel field on disk at all, not an empty
    // string — reading it renders as "undefined" in the UI rather than
    // falling back cleanly. Backfill every existing row once, here, rather
    // than scattering `|| "piece"` fallbacks through every read site.
    this.version(5)
      .stores({})
      .upgrade(async (tx) => {
        await tx
          .table("products")
          .toCollection()
          .modify((product) => {
            if (!product.unitLabel) product.unitLabel = "piece";
          });
      });
    // Additive only: email verification status (PRD Section 10.3 / 2026-08-08).
    // emailVerified is a new optional field on LocalUser — existing rows read it
    // as undefined, treated as unverified (banner shows until confirmed).
    this.version(6).stores({});

    // Remove only retired PIN properties. Operational data and pending
    // outbox entries remain untouched.
    this.version(7)
      .stores({})
      .upgrade(async (tx) => {
        await tx.table("localUsers").toCollection().modify((user) => {
          delete user.pinHash;
          delete user.failedPinAttempts;
          delete user.pinLockedUntil;
        });
      });

    // Tenant isolation for local/offline data. Existing rows are retained and
    // associated with the currently cached business when that identity is
    // available. Unsynced outbox rows are never deleted.
    this.version(8)
      .stores({
        businessProfile: "id, businessId",
        branches: "id, businessId, name",
        products: "id, businessId, name, sku, barcode, categoryId, updatedAt",
        categories: "id, businessId, name",
        customers: "id, businessId, name, phone, updatedAt",
        customerCreditMovements: "id, businessId, clientId, customerId, createdAtLocal",
        stockMovements: "id, businessId, clientId, branchId, productId, createdAtLocal",
        sales: "id, businessId, clientId, branchId, customerId, createdAtLocal",
        outbox: "clientId, businessId, type, status, createdAtLocal",
        localUsers: "id, businessId, role",
        session: "id",
        auditLogs: "id, businessId, clientId, actorUserId, entityType, createdAtLocal",
        expenses: "id, businessId, branchId, category, createdAtLocal",
        suppliers: "id, businessId, name",
        purchases: "id, businessId, clientId, branchId, supplierId, createdAtLocal",
      })
      .upgrade(async (tx) => {
        const profile = await tx.table("businessProfile").get(BUSINESS_PROFILE_SINGLETON_ID);
        const businessId = profile?.businessId as string | undefined;
        if (!businessId) return;
        for (const tableName of [
          "branches", "products", "categories", "customers",
          "customerCreditMovements", "stockMovements", "sales", "outbox",
          "localUsers", "auditLogs", "expenses", "suppliers", "purchases",
        ]) {
          await tx.table(tableName).toCollection().modify((row) => {
            if (!row.businessId) row.businessId = businessId;
          });
        }
      });

    // Repair databases created by the first tenant migration if a test/browser
    // upgrade was interrupted. This is schema-only and preserves every row.
    this.version(9).stores({
      businessProfile: "id, businessId",
      branches: "id, businessId, name",
      products: "id, businessId, name, sku, barcode, categoryId, updatedAt",
      categories: "id, businessId, name",
      customers: "id, businessId, name, phone, updatedAt",
      customerCreditMovements: "id, businessId, clientId, customerId, createdAtLocal",
      stockMovements: "id, businessId, clientId, branchId, productId, createdAtLocal",
      sales: "id, businessId, clientId, branchId, customerId, createdAtLocal",
      outbox: "clientId, businessId, type, status, createdAtLocal",
      localUsers: "id, businessId, role",
      session: "id",
      auditLogs: "id, businessId, clientId, actorUserId, entityType, createdAtLocal",
      expenses: "id, businessId, branchId, category, createdAtLocal",
      suppliers: "id, businessId, name",
      purchases: "id, businessId, clientId, branchId, supplierId, createdAtLocal",
    });
  }
}

export const db = new StockPadiDB();
