"use server";

import { getPool } from "@/lib/db-pool";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { checkRateLimit, recordFailedAttempt, resetRateLimit } from "@/lib/rate-limit";
import { verifyCsrfToken } from "@/lib/csrf";
import { headers } from "next/headers";

const MIN_PASSWORD_LENGTH = 8;

// Server-side Supabase Admin Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export async function createAccountAction(formData: {
  email: string;
  password?: string;
  fullName: string;
  businessName: string;
  businessTypeId: string;
  csrfToken: string;
}) {
  const { email, password, fullName, businessName, businessTypeId, csrfToken } = formData;

  const isCsrfValid = await verifyCsrfToken(csrfToken);
  if (!isCsrfValid) {
    return { success: false, error: "Invalid request. Please refresh the page." };
  }

  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for") || headersList.get("x-real-ip") || "127.0.0.1";
  const limitCheck = checkRateLimit(ip, email);
  if (!limitCheck.allowed) {
    return { success: false, error: `Too many attempts. Please try again in ${limitCheck.waitMinutes} minute(s).` };
  }

  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return { success: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    // Generate a 64-bit integer hash from the email for the Postgres advisory lock
    const hashHex = crypto.createHash("sha256").update(email.toLowerCase().trim()).digest("hex").slice(0, 8);
    const lockKey = parseInt(hashHex, 16);

    // 1. Obtain advisory lock to prevent race conditions uniquely per email
    // BEGIN transaction to hold the xact_lock until COMMIT/ROLLBACK
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [lockKey]);

    // 2. Check for idempotency: Does the user already exist?
    // We check via admin API instead of auth.users since we only have public schema access easily, 
    // but admin API works.
    const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = users?.users.find(u => u.email === email.toLowerCase().trim());

    if (existingUser) {
      await client.query("COMMIT");
      recordFailedAttempt(ip, email);
      return { success: true, message: "Account already exists." };
    }

    // 3. Create the user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password,
      email_confirm: false,
      user_metadata: {
        full_name: fullName.trim(),
        business_name: businessName.trim(),
        business_type_id: businessTypeId,
        role: "owner",
      },
    });

    if (authError || !authData.user) {
      await client.query("ROLLBACK");
      return { success: false, error: authError?.message || "Failed to create account" };
    }

    await client.query("COMMIT");
    resetRateLimit(ip, email);
    return { success: true, userId: authData.user.id };
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    // If unique constraint violation occurs (e.g. Postgres 23505)
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === '23505') {
       return { success: true, message: "Account already exists." };
    }
    return { success: false, error: "An unexpected error occurred during account creation." };
  } finally {
    client.release();
  }
}

import { createClient as createServerClient } from "@/lib/supabase/server";

const VAGUE_ERROR = "Incorrect email or password.";

export async function loginAction(formData: FormData) {
  const email = formData.get("email")?.toString() || "";
  const password = formData.get("password")?.toString() || "";
  const csrfToken = formData.get("csrf_token")?.toString() || "";
  
  // 1. Verify CSRF Token explicitly
  const isCsrfValid = await verifyCsrfToken(csrfToken);
  if (!isCsrfValid) {
    return { success: false, error: "Invalid request. Please refresh the page." };
  }

  // 2. Extract IP for rate limiting (fallback to 127.0.0.1 if missing)
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for") || headersList.get("x-real-ip") || "127.0.0.1";

  // 3. Rate Limit Check
  const limitCheck = checkRateLimit(ip, email);
  if (!limitCheck.allowed) {
    return { 
      success: false, 
      error: `Too many attempts. Please try again in ${limitCheck.waitMinutes} minute(s).` 
    };
  }

  // 4. Attempt server-side login
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error || !data.user) {
    recordFailedAttempt(ip, email);
    // Law 2: vague error messaging always wins (one vague error one uniform timing)
    return { success: false, error: VAGUE_ERROR };
  }

  // 5. Verify the profile exists and is active
  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id, is_active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError || !profile || !profile.is_active) {
    // Treat inactive or missing profile identically as incorrect creds for security
    recordFailedAttempt(ip, email);
    return { success: false, error: VAGUE_ERROR };
  }

  // Success
  resetRateLimit(ip, email);
  return { success: true, profile: { id: profile.id } };
}

export async function logoutAction() {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
}

export async function forgotPasswordAction(formData: FormData) {
  const email = formData.get("email")?.toString() || "";
  const csrfToken = formData.get("csrf_token")?.toString() || "";
  
  const isCsrfValid = await verifyCsrfToken(csrfToken);
  if (!isCsrfValid) {
    return { success: false, error: "Invalid request." };
  }

  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for") || headersList.get("x-real-ip") || "127.0.0.1";
  const limitCheck = checkRateLimit(ip, email);
  if (!limitCheck.allowed) {
    return { success: false, error: `Too many attempts. Please try again in ${limitCheck.waitMinutes} minute(s).` };
  }
  // Unconditional, not just on failure: this endpoint always returns success
  // to prevent email enumeration, so "failed attempt" isn't a meaningful
  // distinction here — every call must count against the cap, or the cap
  // never engages and this stays unlimited email-bombing/SMTP-load exposure.
  recordFailedAttempt(ip, email);

  const supabase = await createServerClient();
  // Vague error messaging applies here too, return success even if user doesn't exist
  // to prevent enumeration.
  await supabase.auth.resetPasswordForEmail(email.toLowerCase().trim(), {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/reset-password`,
  });

  return { success: true };
}

export async function resetPasswordAction(formData: FormData) {
  const password = formData.get("password")?.toString() || "";
  const csrfToken = formData.get("csrf_token")?.toString() || "";

  const isCsrfValid = await verifyCsrfToken(csrfToken);
  if (!isCsrfValid) {
    return { success: false, error: "Invalid request." };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { success: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.updateUser({
    password
  });

  if (error) {
    return { success: false, error: "Could not reset password. Your link may have expired." };
  }

  return { success: true };
}
