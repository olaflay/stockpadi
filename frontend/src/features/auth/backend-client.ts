import { BackendConfigurationError, BackendRequestError, serverPost, serverPostPublic } from "@/features/operations/server-client";

export class BackendError extends Error {
  constructor(message: string, readonly status?: number, readonly code?: string) {
    super(message);
    this.name = "BackendError";
  }
}

export async function callBackend<T>(functionName: string, body: unknown): Promise<T> {
  const backendPath = functionName === "platform-api" ? "/api/admin" : functionName === "account-context" ? "/api/account-context" : functionName === "register-business" ? "/api/businesses/register" : null;
  if (!backendPath) throw new BackendError("Unsupported backend operation.");
  try {
    return await (functionName === "register-business" ? serverPostPublic<T>(backendPath, body) : serverPost<T>(backendPath, body));
  } catch (error) {
    if (error instanceof BackendRequestError || error instanceof BackendConfigurationError) throw new BackendError(error.message, error instanceof BackendRequestError ? error.status : undefined, error.code);
    throw error;
  }
}
