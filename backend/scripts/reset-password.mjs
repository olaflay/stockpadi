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

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, "");
    args[key] = argv[i + 1];
  }
  return args;
}

async function main() {
  const args = parseArgs();
  const { email, password } = args;

  if (!email || !password) {
    console.error('Usage: node scripts/reset-password.mjs --email you@example.com --password "new-password"');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("Password must be at least 8 characters long.");
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

  console.log(`Searching for user with email: ${email}...`);
  const { data: authData, error: authError } = await supabase.auth.admin.listUsers();
  if (authError) {
    console.error("Error fetching auth users:", authError.message);
    process.exit(1);
  }

  const user = authData.users.find(u => u.email?.toLowerCase().trim() === email.toLowerCase().trim());
  if (!user) {
    console.error(`User with email "${email}" not found in Supabase Auth.`);
    process.exit(1);
  }

  console.log(`Found user: ${user.id}. Resetting password...`);
  const { error: updateError } = await supabase.auth.admin.updateUserById(
    user.id,
    { password: password }
  );

  if (updateError) {
    console.error("Failed to update password:", updateError.message);
    process.exit(1);
  }

  console.log(`Successfully updated password for ${email}.`);
}

main().catch(console.error);
