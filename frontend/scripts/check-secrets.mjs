#!/usr/bin/env node
/**
 * check-secrets.mjs — Secret-leak guard for the client bundle.
 *
 * Fails the build if secret material leaks into the frontend. Runs automatically
 * before `npm run build` (npm `prebuild` hook), on local machines and on Vercel,
 * so a leaked secret stops the deploy instead of shipping to the browser.
 *
 * FORBIDDEN (fails the build):
 *   - Secret KEY NAMES in any frontend .env* file or in bundled source
 *     (service-role key, Brevo, SMTP password, database URL names)
 *   - Secret VALUES anywhere in the frontend tree:
 *     Brevo keys (xkeysib- / xsmtpsib-) and Postgres connection URLs
 *
 * ALLOWED (public by design):
 *   - NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY — the
 *     anonymous key is public; RLS is the real security layer
 *     (see ../.agents/rules/database-and-rls.md)
 *   - Site URL, branding, backend URL vars
 *
 * NOTE: do not add scripts/ to SCAN_DIRS — this file itself contains the
 * forbidden key names by design (it is the detector, not the leak).
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, extname } from "node:path";

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const SCAN_DIRS = ["src", "public"];
const ENV_FILES = [".env", ".env.local", ".env.development", ".env.production", ".env.test", ".env.example"];
const EXCLUDE_DIRS = new Set(["node_modules", ".next", "out", ".vercel"]);

// Files that end up in the client bundle (or define env). Docs (.md/.txt) are
// excluded from the NAME check — they legitimately discuss concepts like
// "service_role bypasses RLS" — but are still scanned for secret VALUES.
const BUNDLE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css", ".html", ".svg"]);
const ALL_TEXT_EXTENSIONS = new Set([...BUNDLE_EXTENSIONS, ".md", ".txt", ".yml", ".yaml", ".toml", ".graphql", ".prisma"]);

const FORBIDDEN_KEY_NAMES = [
  "SERVICE_ROLE",        // SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
  "BREVO_API_KEY",
  "BREVO_SMTP",
  "SMTP_PASS",
  "SMTP_PASSWORD",
  "DATABASE_URL",
  "DB_URL",
  "DIRECT_URL",
];

const FORBIDDEN_VALUE_PATTERNS = [
  { pattern: /xkeysib-[A-Za-z0-9_-]+/i, label: "Brevo API key value" },
  { pattern: /xsmtpsib-[A-Za-z0-9_-]+/i, label: "Brevo SMTP key value" },
  { pattern: /postgres(ql)?:\/\/[^\s"'`]+/, label: "Postgres connection URL" },
];

const violations = [];

function mask(value) {
  return value.length > 10 ? `${value.slice(0, 8)}…(masked)` : "…";
}

function checkText(filePath, text, options) {
  const rel = relative(frontendRoot, filePath).replace(/\\/g, "/");
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (options.names) {
      for (const name of FORBIDDEN_KEY_NAMES) {
        if (line.includes(name)) {
          violations.push(`${rel}:${i + 1}  contains forbidden secret key name "${name}"`);
        }
      }
    }
    if (options.values) {
      for (const { pattern, label } of FORBIDDEN_VALUE_PATTERNS) {
        const match = line.match(pattern);
        if (match) {
          violations.push(`${rel}:${i + 1}  contains ${label} (${mask(match[0])})`);
        }
      }
    }
  });
}

function walk(dir, options) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let stats;
    try {
      stats = statSync(full);
    } catch {
      continue;
    }
    if (stats.isDirectory()) {
      walk(full, options);
    } else if (stats.isFile()) {
      const ext = extname(full).toLowerCase();
      const textExtensions = options.names ? BUNDLE_EXTENSIONS : ALL_TEXT_EXTENSIONS;
      if (textExtensions.has(ext)) {
        try {
          checkText(full, readFileSync(full, "utf8"), options);
        } catch {
          // binary or unreadable — skip
        }
      }
    }
  }
}

// 1. Frontend env files: flag secret key NAMES and VALUES.
for (const envFile of ENV_FILES) {
  try {
    checkText(join(frontendRoot, envFile), readFileSync(join(frontendRoot, envFile), "utf8"), { names: true, values: true });
  } catch {
    // env file may not exist — fine
  }
}

// 2. Source + public trees: key NAMES in bundle files, VALUES in all text.
for (const dir of SCAN_DIRS) {
  walk(join(frontendRoot, dir), { names: true });
  walk(join(frontendRoot, dir), { values: true });
}

if (violations.length > 0) {
  console.error("\n❌ SECRET-SCAN FAILED — a secret is leaking into the client bundle.\n");
  for (const v of violations) console.error(`   ${v}`);
  console.error(`
   Secrets belong in backend/.env only. The browser bundle is public: anyone
   can read it. Move the flagged value to the backend and redeploy.
   Public-by-design values (NEXT_PUBLIC_SUPABASE_URL, the anon key) are fine.`);
  process.exit(1);
}

console.log("✅ Secret scan clean — no service-role / Brevo / SMTP / database secrets in the frontend.");
