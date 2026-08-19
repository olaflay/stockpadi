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

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: authData, error } = await supabase.auth.admin.listUsers();
  
  if (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }

  for (const u of authData.users) {
    console.log(`Confirming user: ${u.email}...`);
    const { error: confirmError } = await supabase.auth.admin.updateUserById(
      u.id,
      { email_confirm: true }
    );
    if (confirmError) {
      console.error(`Failed to confirm ${u.email}:`, confirmError.message);
    } else {
      console.log(`Successfully confirmed ${u.email}`);
    }
  }
}

main().catch(console.error);
