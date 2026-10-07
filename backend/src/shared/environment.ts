import contract from "./environment-contract.json" with { type: "json" };

export type RuntimeEnvironment = "local" | "staging" | "production";
export type EnvironmentComponent = "frontend" | "backend";
export type EnvironmentVariables = Readonly<Record<string, string | undefined>>;

export interface EnvironmentValidationResult {
  ok: boolean;
  environment: RuntimeEnvironment;
  projectRef: string | null;
  buildVersion: string;
  errors: string[];
}

export interface EnvironmentIdentity {
  component: EnvironmentComponent;
  environment: RuntimeEnvironment;
  apiVersion: string;
  buildVersion: string;
  supabaseProjectRef: string | null;
}

export interface EnvironmentPairResult {
  ok: boolean;
  errors: string[];
}

export const ENVIRONMENT_CONTRACT = contract;
export const API_VERSION = contract.apiVersion;

function value(env: EnvironmentVariables, name: string): string {
  return env[name]?.trim() ?? "";
}

function isVercel(env: EnvironmentVariables): boolean {
  return value(env, "VERCEL") === "1" || value(env, "VERCEL") === "true";
}

function inferredEnvironment(env: EnvironmentVariables): RuntimeEnvironment {
  const vercelEnvironment = value(env, "VERCEL_ENV");
  if (vercelEnvironment === "production") return "production";
  if (vercelEnvironment === "preview") return "staging";
  return value(env, "NODE_ENV") === "production" && isVercel(env) ? "production" : "local";
}

export function resolveRuntimeEnvironment(
  env: EnvironmentVariables,
  component: EnvironmentComponent,
): RuntimeEnvironment {
  const declared = value(env, component === "frontend" ? "NEXT_PUBLIC_APP_ENV" : "APP_ENV");
  if (declared === "local" || declared === "staging" || declared === "production") return declared;
  return inferredEnvironment(env);
}

export function supabaseProjectRefFromUrl(url: string | undefined): string | null {
  const raw = url?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") return "local";
    const match = /^([a-z0-9-]+)\.supabase\.co$/i.exec(parsed.hostname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function requireValue(env: EnvironmentVariables, name: string, errors: string[]): string {
  const result = value(env, name);
  if (!result) errors.push(`${name} is required`);
  return result;
}

function requireUrl(env: EnvironmentVariables, name: string, errors: string[], httpsOnly: boolean): string {
  const raw = requireValue(env, name, errors);
  if (!raw) return raw;
  try {
    const parsed = new URL(raw);
    if (parsed.username || parsed.password) errors.push(`${name} must not contain embedded credentials`);
    if (!parsed.hostname) errors.push(`${name} must contain a hostname`);
    if (httpsOnly && parsed.protocol !== "https:") errors.push(`${name} must use HTTPS outside local development`);
  } catch {
    errors.push(`${name} must be a valid absolute URL`);
  }
  return raw;
}

function requireProjectIdentity(
  env: EnvironmentVariables,
  urlName: string,
  refName: string,
  environment: RuntimeEnvironment,
  errors: string[],
): string | null {
  const url = requireValue(env, urlName, errors);
  const derived = supabaseProjectRefFromUrl(url);
  const explicit = value(env, refName);
  if (!derived) errors.push(`${urlName} must be a Supabase project URL`);
  if (environment !== "local" && !explicit) errors.push(`${refName} is required outside local development`);
  if (explicit && derived && explicit !== derived) errors.push(`${refName} does not match ${urlName}`);
  return explicit || derived;
}

function rejectPublicSecrets(env: EnvironmentVariables, errors: string[]): void {
  const forbidden = contract.components.frontend.serverOnlyForbidden as readonly string[];
  for (const name of forbidden) {
    if (value(env, name)) errors.push(`${name} is server-only and must not be configured for the browser`);
  }
}

function validateFrontend(env: EnvironmentVariables, environment: RuntimeEnvironment, errors: string[]): string | null {
  rejectPublicSecrets(env, errors);
  const supabaseUrl = requireUrl(env, "NEXT_PUBLIC_SUPABASE_URL", errors, environment !== "local");
  const anonKey = requireValue(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY", errors);
  if (/service_role|secret|private/i.test(anonKey)) errors.push("NEXT_PUBLIC_SUPABASE_ANON_KEY appears to be a server secret");
  const backendUrl = requireUrl(env, "NEXT_PUBLIC_BACKEND_URL", errors, environment !== "local");
  requireUrl(env, "NEXT_PUBLIC_SITE_URL", errors, environment !== "local");
  const projectRef = requireProjectIdentity(env, "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PROJECT_REF", environment, errors);
  const buildVersion = value(env, "NEXT_PUBLIC_BUILD_VERSION");
  if (environment !== "local" && !buildVersion) errors.push("NEXT_PUBLIC_BUILD_VERSION is required outside local development");
  if (environment !== "local" && /localhost|127\.0\.0\.1/i.test(backendUrl)) errors.push("NEXT_PUBLIC_BACKEND_URL must not point to localhost outside local development");
  if (environment !== "local" && /localhost|127\.0\.0\.1/i.test(supabaseUrl)) errors.push("NEXT_PUBLIC_SUPABASE_URL must not point to localhost outside local development");
  return projectRef;
}

function validateBackend(env: EnvironmentVariables, environment: RuntimeEnvironment, errors: string[]): string | null {
  const supabaseUrl = requireUrl(env, "SUPABASE_URL", errors, environment !== "local");
  requireValue(env, "SUPABASE_ANON_KEY", errors);
  requireValue(env, "SUPABASE_SERVICE_ROLE_KEY", errors);
  const frontendOrigins = value(env, "FRONTEND_ORIGINS") || requireValue(env, "FRONTEND_ORIGIN", errors);
  requireUrl(env, "BACKEND_URL", errors, environment !== "local");
  const projectRef = requireProjectIdentity(env, "SUPABASE_URL", "SUPABASE_PROJECT_REF", environment, errors);
  const buildVersion = value(env, "BUILD_VERSION");
  if (environment !== "local" && !buildVersion && !value(env, "VERCEL_GIT_COMMIT_SHA")) errors.push("BUILD_VERSION or VERCEL_GIT_COMMIT_SHA is required outside local development");
  if (environment !== "local" && /localhost|127\.0\.0\.1/i.test(frontendOrigins)) errors.push("FRONTEND_ORIGIN(S) must not point to localhost outside local development");
  if (environment !== "local" && /localhost|127\.0\.0\.1/i.test(supabaseUrl)) errors.push("SUPABASE_URL must not point to localhost outside local development");
  if (environment !== "local" && value(env, "NODE_ENV") !== "production") errors.push("NODE_ENV must be production outside local development");
  if (environment === "production" && value(env, "DEV_LOG_VERIFICATION_CODES").toLowerCase() === "true") errors.push("DEV_LOG_VERIFICATION_CODES must not be enabled in production");
  for (const origin of frontendOrigins.split(",").map((item) => item.trim()).filter(Boolean)) {
    try {
      const parsed = new URL(origin);
      if (parsed.pathname !== "/" || parsed.search || parsed.hash) errors.push("FRONTEND_ORIGIN(S) must contain origins, not paths");
      if (environment !== "local" && parsed.protocol !== "https:") errors.push("FRONTEND_ORIGIN(S) must use HTTPS outside local development");
    } catch {
      errors.push("FRONTEND_ORIGIN(S) contains an invalid URL");
    }
  }
  return projectRef;
}

function validateVercelEnvironment(env: EnvironmentVariables, environment: RuntimeEnvironment, errors: string[]): void {
  if (!isVercel(env)) return;
  const vercelEnvironment = value(env, "VERCEL_ENV");
  if (vercelEnvironment === "production" && environment !== "production") errors.push("VERCEL production requires APP_ENV/NEXT_PUBLIC_APP_ENV=production");
  if (vercelEnvironment === "preview" && environment !== "staging") errors.push("VERCEL preview requires APP_ENV/NEXT_PUBLIC_APP_ENV=staging");
}

export function validateRuntimeEnvironment(
  env: EnvironmentVariables,
  component: EnvironmentComponent,
): EnvironmentValidationResult {
  const environment = resolveRuntimeEnvironment(env, component);
  const errors: string[] = [];
  const environmentVariable = component === "frontend" ? "NEXT_PUBLIC_APP_ENV" : "APP_ENV";
  if (environment !== "local" && !value(env, environmentVariable)) errors.push(`${environmentVariable} is required outside local development`);
  if (value(env, "NODE_ENV") === "production" && !value(env, environmentVariable)) errors.push(`${environmentVariable} is required when NODE_ENV=production`);
  const projectRef = component === "frontend"
    ? validateFrontend(env, environment, errors)
    : validateBackend(env, environment, errors);
  validateVercelEnvironment(env, environment, errors);
  return {
    ok: errors.length === 0,
    environment,
    projectRef,
    buildVersion: value(env, component === "frontend" ? "NEXT_PUBLIC_BUILD_VERSION" : "BUILD_VERSION") || value(env, "VERCEL_GIT_COMMIT_SHA") || "local",
    errors,
  };
}

export function validateEnvironmentPair(
  frontendEnv: EnvironmentVariables,
  backendEnv: EnvironmentVariables,
): EnvironmentPairResult {
  const frontend = validateRuntimeEnvironment(frontendEnv, "frontend");
  const backend = validateRuntimeEnvironment(backendEnv, "backend");
  const errors = [...frontend.errors.map((error) => `frontend: ${error}`), ...backend.errors.map((error) => `backend: ${error}`)];
  if (frontend.environment !== backend.environment) errors.push("frontend and backend APP_ENV values do not match");
  if (frontend.projectRef && backend.projectRef && frontend.projectRef !== backend.projectRef) errors.push("frontend and backend Supabase project references do not match");
  const frontendBackendUrl = value(frontendEnv, "NEXT_PUBLIC_BACKEND_URL").replace(/\/$/, "");
  const backendUrl = value(backendEnv, "BACKEND_URL").replace(/\/$/, "");
  if (frontendBackendUrl && backendUrl && frontendBackendUrl !== backendUrl) errors.push("NEXT_PUBLIC_BACKEND_URL does not match BACKEND_URL");
  const frontendSiteUrl = value(frontendEnv, "NEXT_PUBLIC_SITE_URL").replace(/\/$/, "");
  const backendOrigins = (value(backendEnv, "FRONTEND_ORIGINS") || value(backendEnv, "FRONTEND_ORIGIN")).split(",").map((item) => item.trim().replace(/\/$/, ""));
  if (frontendSiteUrl && backendOrigins.filter(Boolean).length > 0 && !backendOrigins.includes(frontendSiteUrl)) errors.push("backend CORS origins do not include NEXT_PUBLIC_SITE_URL");
  if (frontend.buildVersion !== "local" && backend.buildVersion !== "local" && frontend.buildVersion !== backend.buildVersion) errors.push("frontend and backend build versions do not match");
  return { ok: errors.length === 0, errors };
}

export function getEnvironmentIdentity(env: EnvironmentVariables, component: EnvironmentComponent): EnvironmentIdentity {
  const result = validateRuntimeEnvironment(env, component);
  return {
    component,
    environment: result.environment,
    apiVersion: API_VERSION,
    buildVersion: result.buildVersion,
    supabaseProjectRef: result.projectRef,
  };
}

export function assertRuntimeEnvironment(env: EnvironmentVariables, component: EnvironmentComponent): EnvironmentValidationResult {
  const result = validateRuntimeEnvironment(env, component);
  if (!result.ok) throw new Error(`${component} environment validation failed: ${result.errors.join("; ")}`);
  return result;
}
