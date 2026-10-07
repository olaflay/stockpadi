import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ENVIRONMENT_CONTRACT,
  validateEnvironmentPair,
  validateRuntimeEnvironment,
} from "../packages/contracts/dist/environment.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readDotEnv(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  const result = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    result[match[1]] = value;
  }
  return result;
}

function arg(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function output(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

if (process.argv.includes("--matrix")) {
  output(ENVIRONMENT_CONTRACT);
  process.exit(0);
}

const component = arg("--component");
if (component !== "frontend" && component !== "backend" && component !== "pair") {
  console.error("Usage: npm run env:validate -- --component frontend|backend|pair [--frontend-file path --backend-file path]");
  process.exit(2);
}

const frontendEnv = { ...process.env, ...readDotEnv(path.resolve(root, arg("--frontend-file") ?? "frontend/.env.local")) };
const backendEnv = { ...process.env, ...readDotEnv(path.resolve(root, arg("--backend-file") ?? "backend/.env")) };
const result = component === "pair"
  ? validateEnvironmentPair(frontendEnv, backendEnv)
  : validateRuntimeEnvironment(component === "frontend" ? frontendEnv : backendEnv, component);

output(result);
if (!result.ok) process.exit(1);
