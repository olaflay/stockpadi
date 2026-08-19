#!/usr/bin/env node
// Local/staging bootstrap only. Normal production registration uses the
// backend businesses module. This script intentionally has no PIN flow.

import { createClient } from "@supabase/supabase-js";

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, "")] = argv[i + 1];
  return args;
}

const args = parseArgs();
const name = args.name?.trim();
const email = args.email?.trim().toLowerCase();
const password = args.password;
const businessName = args["business-name"]?.trim();
const businessType = args["business-type"]?.trim() || "General Retail";
const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!name || !email || !password || !businessName) {
  throw new Error('Usage: npm run seed:owner -- --name "Test Owner" --email owner@example.com --password "temporary-password" --business-name "Test Shop" [--business-type "General Retail"]');
}
if (!url || !serviceKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in backend/.env");
if (password.length < 6) throw new Error("Password must be at least 6 characters");

const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: existing, error: existingError } = await supabase
  .from("business_memberships")
  .select("user_id")
  .eq("account_type", "BUSINESS_OWNER")
  .limit(1);
if (existingError) throw new Error(`Could not check existing Owners: ${existingError.message}`);
if (existing?.length) throw new Error("An Owner already exists; refusing to create a duplicate bootstrap account.");

const { data: created, error: authError } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
if (authError || !created.user) throw new Error(`Could not create Auth user: ${authError?.message ?? "unknown error"}`);

try {
  const { error: provisionError } = await supabase.rpc("provision_business_owner", {
    p_user_id: created.user.id,
    p_full_name: name,
    p_business_name: businessName,
    p_business_type: businessType,
  });
  if (provisionError) throw new Error(provisionError.message);
} catch (error) {
  await supabase.auth.admin.deleteUser(created.user.id).catch(() => {});
  throw new Error(`Owner provisioning failed; Auth user was compensated: ${error instanceof Error ? error.message : String(error)}`);
}

console.log(`Owner created: ${email}`);
console.log(`Business: ${businessName}`);
