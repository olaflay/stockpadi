import { authenticateRequest } from "../../middleware/authenticate.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { parseRegistration } from "./business.schema.js";
import { registerBusiness } from "./business.service.js";

export async function handleBusinessRegistration(request: globalThis.Request, body: unknown) {
  const parsed = parseRegistration(body);
  const authenticated = parsed.action === "complete_oauth" ? (await authenticateRequest(request)).user : undefined;
  return registerBusiness(parsed, authenticated);
}
