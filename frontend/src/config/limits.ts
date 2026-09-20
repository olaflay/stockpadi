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

/** Browser-side import bounds, separate from the business product cap. */
export const PRODUCT_IMPORT_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const PRODUCT_IMPORT_MAX_ROWS = PRODUCT_CAP;
export const PRODUCT_IMPORT_MAX_COLUMNS = 32;
export const PRODUCT_IMPORT_MAX_WORKSHEETS = 3;

/** High-risk offline writes pause only when both age and volume indicate a
 * queue that needs operator attention. Tune per client here, not in screens. */
export const SYNC_REQUIRED_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const SYNC_REQUIRED_QUEUE_THRESHOLD = 100;
