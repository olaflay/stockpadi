const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// A secondary, email-only cap — more generous (higher threshold, longer
// window) than the ip+email cap below, but keyed by email alone so it
// cannot be bypassed by spraying attempts against one target email from
// many rotating source IPs, which the ip+email key alone allows (each new
// IP gets a fresh 5-attempt allowance against the same email).
const MAX_ATTEMPTS_PER_EMAIL = 20;
const EMAIL_LOCKOUT_MINUTES = 30;

interface RateLimitRecord {
  count: number;
  lockedUntil: number | null;
}

// In-memory store. In a multi-instance setup, this would be Redis or Postgres.
// Since this app runs as a single Pxxl instance, this is highly efficient.
// Resets on process restart — acceptable for the single-instance deployment
// this is scoped to, not a general-purpose distributed rate limiter. If this
// project is ever scaled to multiple Pxxl instances, this must move to a
// shared store (Redis or Postgres) or attempts can be bypassed by hitting
// different instances.
const rateLimitsByIpAndEmail = new Map<string, RateLimitRecord>();
const rateLimitsByEmail = new Map<string, RateLimitRecord>();

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

function checkRecord(
  store: Map<string, RateLimitRecord>,
  key: string
): { allowed: boolean; waitMinutes?: number } {
  const record = store.get(key);
  if (!record) return { allowed: true };

  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    return { allowed: false, waitMinutes: Math.ceil((record.lockedUntil - Date.now()) / 60000) };
  }

  if (record.lockedUntil && Date.now() >= record.lockedUntil) {
    record.count = 0;
    record.lockedUntil = null;
  }

  return { allowed: true };
}

export function checkRateLimit(ip: string, email: string): { allowed: boolean; waitMinutes?: number } {
  const normalizedEmail = normalizeEmail(email);

  const ipResult = checkRecord(rateLimitsByIpAndEmail, `${ip}::${normalizedEmail}`);
  if (!ipResult.allowed) return ipResult;

  const emailResult = checkRecord(rateLimitsByEmail, normalizedEmail);
  if (!emailResult.allowed) return emailResult;

  return { allowed: true };
}

function recordAttempt(store: Map<string, RateLimitRecord>, key: string, maxAttempts: number, lockoutMinutes: number) {
  const record = store.get(key) || { count: 0, lockedUntil: null };
  record.count += 1;
  if (record.count >= maxAttempts) {
    record.lockedUntil = Date.now() + lockoutMinutes * 60 * 1000;
  }
  store.set(key, record);
}

export function recordFailedAttempt(ip: string, email: string) {
  const normalizedEmail = normalizeEmail(email);
  recordAttempt(rateLimitsByIpAndEmail, `${ip}::${normalizedEmail}`, MAX_ATTEMPTS, LOCKOUT_MINUTES);
  recordAttempt(rateLimitsByEmail, normalizedEmail, MAX_ATTEMPTS_PER_EMAIL, EMAIL_LOCKOUT_MINUTES);
}

export function resetRateLimit(ip: string, email: string) {
  const normalizedEmail = normalizeEmail(email);
  rateLimitsByIpAndEmail.delete(`${ip}::${normalizedEmail}`);
  rateLimitsByEmail.delete(normalizedEmail);
}
