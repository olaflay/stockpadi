import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  try {
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
  } catch (err) {
    console.error("Failed to load .env.local:", err.message);
    process.exit(1);
  }
}

async function main() {
  const env = loadEnvLocal();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  console.log("=== Auth Users ===");
  const { data: authData, error: authError } = await supabase.auth.admin.listUsers();
  if (authError) {
    console.error("Error fetching auth users:", authError.message);
  } else {
    console.log(`Found ${authData.users.length} user(s) in Supabase Auth:`);
    authData.users.forEach(u => {
      console.log(`- ID: ${u.id}`);
      console.log(`  Email: ${u.email}`);
      console.log(`  Created: ${u.created_at}`);
      console.log(`  Metadata:`, u.user_metadata);
    });
  }

  console.log("\n=== Public Users Table ===");
  const { data: publicUsers, error: publicUsersError } = await supabase
    .from("users")
    .select("*");
  if (publicUsersError) {
    console.error("Error fetching public users:", publicUsersError.message);
  } else {
    console.log(`Found ${publicUsers.length} user(s) in public.users table:`);
    publicUsers.forEach(u => {
      console.log(`- ID: ${u.id}`);
      console.log(`  Business ID: ${u.business_id}`);
      console.log(`  Full Name: ${u.full_name}`);
      console.log(`  Role: ${u.role}`);
      console.log(`  Is Active: ${u.is_active}`);
      console.log(`  PIN Hash Present: ${u.pin_hash ? "Yes" : "No"}`);
    });
  }

  console.log("\n=== Business Profiles ===");
  const { data: businesses, error: businessError } = await supabase
    .from("business_profile")
    .select("*");
  if (businessError) {
    console.error("Error fetching businesses:", businessError.message);
  } else {
    console.log(`Found ${businesses.length} business profile(s):`);
    businesses.forEach(b => {
      console.log(`- ID: ${b.id}`);
      console.log(`  Name: ${b.name}`);
      console.log(`  Type: ${b.business_type}`);
    });
  }
}

main().catch(console.error);
