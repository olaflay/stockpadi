#!/usr/bin/env node
// One-time bootstrap: creates the single Owner account for this deployment.
// This is deliberately NOT a screen in the app — the app has no public
// signup, per the single-tenant model in .agents/rules/database-and-rls.md.
// Every other staff account is created by the Owner, from inside the app
// (Staff & Access → Add Staff), through the manage-staff Edge Function.
// This script exists only to bootstrap the very first account, once.
//
// Usage:
//   node scripts/seed-owner.mjs --name "Your Name" --email you@example.com --password "temporary-password" --pin 1234
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from
// .env.local (same file the app itself reads).

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, "");
    args[key] = argv[i + 1];
  }
  return args;
}

// Mirrors src/lib/pin-hash.ts exactly — same iteration count, hash, and
// "<saltHex>:<hashHex>" format, so the app's own verifyPin() accepts it.
const PBKDF2_ITERATIONS = 100_000;
const HASH_BITS = 256;

function toHex(bytes) {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPin(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    HASH_BITS
  );
  return `${toHex(salt.buffer)}:${toHex(bits)}`;
}

async function main() {
  const args = parseArgs();
  const { name, email, password, pin } = args;

  if (!name || !email || !password || !pin) {
    console.error(
      'Usage: node scripts/seed-owner.mjs --name "Your Name" --email you@example.com --password "temp-password" --pin 1234'
    );
    process.exit(1);
  }
  if (!/^\d{4}$/.test(pin)) {
    console.error("PIN must be exactly 4 digits.");
    process.exit(1);
  }
  if (password.length < 6) {
    console.error("Password must be at least 6 characters (Supabase Auth minimum).");
    process.exit(1);
  }

  const env = loadEnvLocal();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  console.log("Checking for an existing owner...");
  const { data: existingOwners, error: existingOwnersError } = await supabase
    .from("users")
    .select("id, full_name")
    .eq("role", "owner");
  if (existingOwnersError) {
    console.error("Could not check for an existing owner:", existingOwnersError.message);
    process.exit(1);
  }
  if (existingOwners.length > 0) {
    console.error(
      `An Owner account already exists (${existingOwners[0].full_name}). Refusing to create a second one — the single-tenant model expects exactly one Owner.`
    );
    process.exit(1);
  }

  console.log("Creating the auth account...");
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    console.error("Could not create the auth account:", createError?.message);
    process.exit(1);
  }

  console.log("Hashing the PIN...");
  const pinHash = await hashPin(pin);

  console.log("Creating the owner profile...");
  const { error: insertError } = await supabase.from("users").insert({
    id: created.user.id,
    full_name: name,
    role: "owner",
    pin_hash: pinHash,
    is_active: true,
  });
  if (insertError) {
    console.error("Could not create the owner profile, rolling back the auth account:", insertError.message);
    await supabase.auth.admin.deleteUser(created.user.id);
    process.exit(1);
  }

  console.log("\nDone. Owner account created:");
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}  (use this once, at /login)`);
  console.log(`  PIN:      ${pin}  (use this every day after, at /unlock)`);
}

main();
