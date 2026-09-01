/**
 * Per-business usage ceilings. Fork-level configuration, per
 * .agents/rules/reusability-and-multi-client.md — a future client tunes these
 * in one place without touching product code.
 *
 * PRODUCT_CAP is a deliberately soft starting ceiling for a brand-new store:
 * deliberately well below any infrastructure limit so there is slack, and
 * enforced on the client at the two places products get created (Add Product,
 * CSV import). PRODUCT_CAP_WARN_AT is the point where the UI starts saying
 * "getting close" before anything is blocked.
 */
export const PRODUCT_CAP = 2500;

/** Warning kicks in at 85% of the cap, leaving breathing room before the block. */
export const PRODUCT_CAP_WARN_AT = Math.floor(PRODUCT_CAP * 0.85);
