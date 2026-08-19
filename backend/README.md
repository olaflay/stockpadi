# StockPadi backend

This package is independently installable, type-checkable, buildable, and runnable.

```bash
npm install
npm run build
npm start
```

`GET /health` is the process health endpoint. Authenticated domain operations
remain in `supabase/functions/`, where they already run with the correct
Supabase Auth, service-role, RPC, and RLS boundaries. This package must never
contain or expose `SUPABASE_SERVICE_ROLE_KEY` to the frontend.

Database migrations remain exclusively in `../supabase/migrations/`.
