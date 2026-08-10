-- Adds a wrong-guess counter for the current email verification code.
-- Previously nothing limited how many codes could be submitted against the
-- still-valid code within its 30-minute window — only issuing a *new* code
-- was throttled (send-verification's 60s cooldown), not guessing the
-- current one. A 6-digit code (1,000,000 combinations) is brute-forceable
-- well within 30 minutes at typical HTTP throughput. Invalidate the code
-- after a small number of wrong guesses, forcing a resend, per
-- supabase/functions/verify-email/index.ts.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email_verification_attempts INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.users.email_verification_attempts IS
  'Wrong guesses against the CURRENT email_verification_code_hash. Reset to 0 whenever a new code is issued (send-verification) or verification succeeds. Code is invalidated once this reaches the limit enforced in verify-email/index.ts.';
