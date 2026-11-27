import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { test } from "node:test";
import { promisify } from "node:util";

const run = promisify(execFile);

test("deployment verification detects a frontend rewrite to an older backend", async () => {
  let routedBuild = "current";
  let workerBuild = "current";
  const identity = { environment: "staging", apiVersion: "v1", buildVersion: "current", supabaseProjectRef: "test-project" };
  const server = createServer((request, response) => {
    if (request.url === "/sw.js") {
      return response.end(`let eR="${workerBuild}",eq=\`stockpadi-navigation-\${eR}\`;`);
    }
    response.setHeader("content-type", "application/json");
    if (request.url === "/api/products") {
      response.statusCode = 401;
      return response.end(JSON.stringify({ error: { code: "UNAUTHENTICATED" } }));
    }
    if (request.url === "/api/version") return response.end(JSON.stringify({ build: routedBuild }));
    assert.ok(request.url === "/api/environment" || request.url === "/health");
    response.end(JSON.stringify(identity));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const env = {
    ...process.env,
    FRONTEND_URL: origin,
    BACKEND_URL: origin,
    EXPECTED_BUILD_VERSION: "current",
    EXPECTED_NEXT_PUBLIC_APP_ENV: "staging",
    EXPECTED_SUPABASE_PROJECT_REF: "test-project",
  };
  const verify = () => run(process.execPath, ["scripts/verify-deployment.mjs"], { env, timeout: 10_000 });
  try {
    assert.equal(JSON.parse((await verify()).stdout).ok, true);
    routedBuild = "previous";
    await assert.rejects(verify(), (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stdout, /frontend API is routing to backend build previous, expected current/);
      return true;
    });
    routedBuild = "current";
    workerBuild = "previous";
    await assert.rejects(verify(), { code: 1, stdout: /service worker version does not match frontend build version/ });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
