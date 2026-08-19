const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)?.replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const fullName = process.env.ADMIN_FULL_NAME?.trim() || "StockPadi Admin";

if (!url || !serviceKey || !email || !password) {
  throw new Error("Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL and ADMIN_PASSWORD first.");
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

async function request(path, options = {}) {
  const response = await fetch(`${url}${path}`, { ...options, headers: { ...headers, ...(options.headers ?? {}) } });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) {
    const message = body?.message || body?.msg || body?.error_description || body?.error || `Request failed with HTTP ${response.status}`;
    throw new Error(message);
  }
  return body;
}

const existing = await request("/rest/v1/platform_admins?select=user_id&limit=1");
if (Array.isArray(existing) && existing.length > 0) {
  throw new Error("A platform admin already exists. This operation is intentionally one-admin-only.");
}

const created = await request("/auth/v1/admin/users", {
  method: "POST",
  body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: fullName, account_type: "ADMIN" } }),
});
const userId = created?.id;
if (!userId) throw new Error("Supabase did not return the new admin user ID.");

try {
  await request("/rest/v1/users", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id: userId, business_id: null, full_name: fullName, role: "super_admin", account_type: "ADMIN", is_active: true }),
  });
  await request("/rest/v1/platform_admins", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ user_id: userId, status: "active" }),
  });
} catch (error) {
  await request(`/auth/v1/admin/users/${userId}`, { method: "DELETE" }).catch(() => {});
  throw error;
}

console.log(`Platform admin created: ${email}`);
