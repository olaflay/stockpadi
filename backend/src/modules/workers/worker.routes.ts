export const workerRoutes = {
  list: { method: "GET", path: "/api/workers" },
  audit: { method: "GET", path: "/api/workers/audit" },
  create: { method: "POST", path: "/api/workers" },
  action: { method: "POST", path: "/api/workers/:id/action" },
} as const;
