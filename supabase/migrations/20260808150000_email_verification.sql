-- Migration: email verification columns on the users table.
-- Adds email_verified (boolean, default false) and two nullable columns
-- for the code hash + expiry that the send-verification Edge Function writes.
-- The verification code itself is never stored in plain text — the Edge
-- Function stores a SHA-256 hash of the code, and compares a hash of the
-- submitted code against it, never comparing raw strings.
-- See supabase/functions/send-verification/index.ts.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_verification_code_hash TEXT,
  ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMPTZ;

-- Index for the verify-email lookup (hash + expiry check).
CREATE INDEX IF NOT EXISTS idx_users_email_verification
  ON public.users (email_verification_code_hash, email_verification_expires_at)
  WHERE email_verified = FALSE;

-- Existing rows (the owner account created before this migration) start
-- as unverified, consistent with the new column default.
-- No explicit UPDATE needed — DEFAULT FALSE covers it.

COMMENT ON COLUMN public.users.email_verified IS
  'True once the owner has confirmed their email via a code sent by the send-verification Edge Function. Staff accounts are not verified by email.';
COMMENT ON COLUMN public.users.email_verification_code_hash IS
  'SHA-256 hex digest of the 6-digit verification code. Cleared on successful verification.';
COMMENT ON COLUMN public.users.email_verification_expires_at IS
  'Expiry timestamp for the current verification code (30 minutes from issuance). Cleared on successful verification.';
