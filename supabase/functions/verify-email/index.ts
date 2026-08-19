// Compatibility adapter only. Email verification logic lives in backend/src/modules/auth.
import { serveBackendAdapter } from "../_shared/backend-adapter.ts";
serveBackendAdapter("/api/auth/email-verification/verify", "verify-email");
