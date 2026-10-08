function baseUrl(value, name) {
  if (!value) throw new Error(`${name} is required`);
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") throw new Error(`${name} must use HTTPS outside local development`);
  return url.toString().replace(/\/$/, "");
}

async function getJson(url) {
  const response = await fetch(url, { redirect: "error" });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = null; }
  return { response, body };
}

const frontendUrl = baseUrl(process.env.FRONTEND_URL, "FRONTEND_URL");
const backendUrl = baseUrl(process.env.BACKEND_URL, "BACKEND_URL");
const expectedEnvironment = process.env.EXPECTED_NEXT_PUBLIC_APP_ENV;
const expectedProjectRef = process.env.EXPECTED_SUPABASE_PROJECT_REF;
const expectedBuildVersion = process.env.EXPECTED_BUILD_VERSION;

const frontend = await getJson(`${frontendUrl}/api/environment`);
const backend = await getJson(`${backendUrl}/health`);
const frontendApi = await fetch(`${frontendUrl}/api/products`, { redirect: "error" });
const serviceWorker = await fetch(`${frontendUrl}/sw.js`, { redirect: "error" });
const serviceWorkerText = await serviceWorker.text();
const errors = [];

if (frontend.response.status !== 200) errors.push(`frontend environment endpoint returned ${frontend.response.status}`);
if (backend.response.status !== 200) errors.push(`backend health returned ${backend.response.status}`);
if (frontendApi.status !== 401) errors.push(`frontend protected API expected 401, received ${frontendApi.status}`);
if (serviceWorker.status !== 200) errors.push(`service worker returned ${serviceWorker.status}`);
if (!frontend.body || !backend.body) errors.push("frontend/backend identity response was not valid JSON");
if (frontend.body?.environment !== backend.body?.environment) errors.push("frontend/backend environment identity mismatch");
if (frontend.body?.apiVersion !== backend.body?.apiVersion) errors.push("frontend/backend API version mismatch");
if (frontend.body?.buildVersion !== backend.body?.buildVersion) errors.push("frontend/backend build version mismatch");
if (frontend.body?.supabaseProjectRef !== backend.body?.supabaseProjectRef) errors.push("frontend/backend Supabase project identity mismatch");
if (expectedEnvironment && frontend.body?.environment !== expectedEnvironment) errors.push("deployed environment does not match EXPECTED_NEXT_PUBLIC_APP_ENV");
if (expectedProjectRef && frontend.body?.supabaseProjectRef !== expectedProjectRef) errors.push("deployed project does not match EXPECTED_SUPABASE_PROJECT_REF");
if (expectedBuildVersion && frontend.body?.buildVersion !== expectedBuildVersion) errors.push("deployed build does not match EXPECTED_BUILD_VERSION");
if (frontend.body?.buildVersion && !serviceWorkerText.includes(`stockpadi-navigation-${frontend.body.buildVersion}`)) errors.push("service worker version does not match frontend build version");

const result = {
  ok: errors.length === 0,
  frontend: frontend.body ? {
    environment: frontend.body.environment,
    apiVersion: frontend.body.apiVersion,
    buildVersion: frontend.body.buildVersion,
    supabaseProjectRef: frontend.body.supabaseProjectRef,
  } : null,
  backend: backend.body ? {
    environment: backend.body.environment,
    apiVersion: backend.body.apiVersion,
    buildVersion: backend.body.buildVersion,
    supabaseProjectRef: backend.body.supabaseProjectRef,
  } : null,
  serviceWorker: { status: serviceWorker.status },
  errors,
};
console.log(JSON.stringify(result, null, 2));
// Set the exit code instead of calling process.exit(), so undici can close
// response sockets cleanly on Windows and CI receives a normal failure.
if (!result.ok) process.exitCode = 1;
