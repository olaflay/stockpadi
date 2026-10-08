import { describe, expect, it } from "vitest";
import { getEnvironmentIdentity, validateEnvironmentPair, validateRuntimeEnvironment } from "./environment.js";

const frontend = {
  NEXT_PUBLIC_APP_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: "https://same-project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PROJECT_REF: "same-project",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
  NEXT_PUBLIC_BACKEND_URL: "https://api.example.com",
  NEXT_PUBLIC_SITE_URL: "https://app.example.com",
  NEXT_PUBLIC_BUILD_VERSION: "commit-123",
  VERCEL: "1",
  VERCEL_ENV: "production",
};

const backend = {
  NEXT_PUBLIC_APP_ENV: "production",
  NODE_ENV: "production",
  SUPABASE_URL: "https://same-project.supabase.co",
  SUPABASE_PROJECT_REF: "same-project",
  SUPABASE_ANON_KEY: "public-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "server-only-secret",
  FRONTEND_ORIGIN: "https://app.example.com",
  BACKEND_URL: "https://api.example.com",
  BUILD_VERSION: "commit-123",
  VERCEL: "1",
  VERCEL_ENV: "production",
};

describe("runtime environment contract", () => {
  it("rejects missing production variables", () => {
    const result = validateRuntimeEnvironment({ NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "production" }, "backend");
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      "SUPABASE_URL is required",
      "SUPABASE_SERVICE_ROLE_KEY is required",
      "NEXT_PUBLIC_APP_ENV is required outside local development",
    ]));
  });

  it("rejects a project reference that does not match its URL", () => {
    const result = validateRuntimeEnvironment({ ...frontend, NEXT_PUBLIC_SUPABASE_PROJECT_REF: "other-project" }, "frontend");
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("NEXT_PUBLIC_SUPABASE_PROJECT_REF does not match NEXT_PUBLIC_SUPABASE_URL");
  });

  it("normalizes trailing slashes when comparing the backend origin", () => {
    expect(validateEnvironmentPair(
      { ...frontend, NEXT_PUBLIC_BACKEND_URL: "https://api.example.com/", NEXT_PUBLIC_SITE_URL: "https://app.example.com/" },
      { ...backend, BACKEND_URL: "https://api.example.com/", FRONTEND_ORIGIN: "https://app.example.com/" },
    )).toEqual({ ok: true, errors: [] });
  });

  it("rejects a different backend API origin", () => {
    const result = validateEnvironmentPair(frontend, { ...backend, BACKEND_URL: "https://other-api.example.com" });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("NEXT_PUBLIC_BACKEND_URL does not match BACKEND_URL");
  });

  it("rejects the wrong protocol outside local development", () => {
    const result = validateRuntimeEnvironment({ ...backend, BACKEND_URL: "http://api.example.com" }, "backend");
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("BACKEND_URL must use HTTPS outside local development");
  });

  it("rejects a frontend/backend environment mismatch", () => {
    const result = validateEnvironmentPair(frontend, { ...backend, NEXT_PUBLIC_APP_ENV: "staging", VERCEL_ENV: "preview" });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("frontend and backend NEXT_PUBLIC_APP_ENV values do not match");
  });

  it("allows Preview deployments to reuse the single hosted production configuration", () => {
    const result = validateRuntimeEnvironment({ ...backend, VERCEL_ENV: "preview" }, "backend");
    expect(result).toMatchObject({ ok: true, environment: "production", projectRef: "same-project" });
  });


  it("rejects production using development configuration", () => {
    const result = validateRuntimeEnvironment({ ...backend, NODE_ENV: "development", FRONTEND_ORIGIN: "http://localhost:3000" }, "backend");
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      "FRONTEND_ORIGIN(S) must use HTTPS outside local development",
      "NODE_ENV must be production outside local development",
    ]));
  });

  it("accepts aligned frontend and backend identity", () => {
    expect(validateEnvironmentPair(frontend, backend)).toEqual({ ok: true, errors: [] });
    expect(getEnvironmentIdentity(frontend, "frontend")).toMatchObject({
      component: "frontend",
      environment: "production",
      apiVersion: "v1",
      buildVersion: "commit-123",
      supabaseProjectRef: "same-project",
    });
  });

  it("rejects a frontend/backend project mismatch", () => {
    const result = validateEnvironmentPair(frontend, { ...backend, SUPABASE_URL: "https://other-project.supabase.co", SUPABASE_PROJECT_REF: "other-project" });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("frontend and backend Supabase project references do not match");
  });
});
