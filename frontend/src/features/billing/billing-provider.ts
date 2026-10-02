/**
 * Billing Provider Interface (Ports and Adapters Architecture)
 * 
 * Defines the contract for subscription tiers, usage limits, and entitlement checks.
 * Allows OjàPadi to run in local-first zero-cloud mode (Free Tier) or plug in payment
 * gateways (Paystack / Flutterwave / Stripe) without coupling domain logic to a specific provider.
 */

export type SubscriptionTier = "FREE" | "STARTER" | "GROWTH";

export interface PlanLimits {
  tier: SubscriptionTier;
  maxProducts: number;
  maxBranches: number;
  maxDevices: number;
  cloudSyncEnabled: boolean;
  whatsappReceiptsEnabled: boolean;
  advancedReportsEnabled: boolean;
}

export interface IBillingProvider {
  getCurrentTier(): Promise<SubscriptionTier>;
  getLimits(): Promise<PlanLimits>;
  checkCanAddProduct(currentProductCount: number): Promise<{ allowed: boolean; reason?: string }>;
  checkCanAddBranch(currentBranchCount: number): Promise<{ allowed: boolean; reason?: string }>;
}

export const TIER_LIMITS: Record<SubscriptionTier, PlanLimits> = {
  FREE: {
    tier: "FREE",
    maxProducts: 75,
    maxBranches: 1,
    maxDevices: 1,
    cloudSyncEnabled: false, // Local-first offline IndexedDB; zero cloud infrastructure egress
    whatsappReceiptsEnabled: true,
    advancedReportsEnabled: false,
  },
  STARTER: {
    tier: "STARTER",
    maxProducts: 1000,
    maxBranches: 1,
    maxDevices: 3,
    cloudSyncEnabled: true,
    whatsappReceiptsEnabled: true,
    advancedReportsEnabled: true,
  },
  GROWTH: {
    tier: "GROWTH",
    maxProducts: 10000,
    maxBranches: 6,
    maxDevices: 10,
    cloudSyncEnabled: true,
    whatsappReceiptsEnabled: true,
    advancedReportsEnabled: true,
  },
};

/**
 * Local-First Default Billing Provider
 * Evaluates entitlements directly from local store state with zero network overhead.
 */
export class LocalBillingProvider implements IBillingProvider {
  private tier: SubscriptionTier;

  constructor(initialTier: SubscriptionTier = "FREE") {
    this.tier = initialTier;
  }

  async getCurrentTier(): Promise<SubscriptionTier> {
    return this.tier;
  }

  async getLimits(): Promise<PlanLimits> {
    return TIER_LIMITS[this.tier];
  }

  async checkCanAddProduct(currentProductCount: number): Promise<{ allowed: boolean; reason?: string }> {
    const limits = await this.getLimits();
    if (currentProductCount >= limits.maxProducts) {
      return {
        allowed: false,
        reason: `Product limit reached (${limits.maxProducts} products on ${limits.tier} plan). Upgrade to add more products.`,
      };
    }
    return { allowed: true };
  }

  async checkCanAddBranch(currentBranchCount: number): Promise<{ allowed: boolean; reason?: string }> {
    const limits = await this.getLimits();
    if (currentBranchCount >= limits.maxBranches) {
      return {
        allowed: false,
        reason: `Branch limit reached (${limits.maxBranches} branch on ${limits.tier} plan). Upgrade for multi-branch support.`,
      };
    }
    return { allowed: true };
  }
}

export const defaultBillingProvider = new LocalBillingProvider();
