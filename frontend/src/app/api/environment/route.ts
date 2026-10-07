import { getEnvironmentIdentity } from "@stockpadi/contracts/config";

export function GET() {
  return Response.json(getEnvironmentIdentity(process.env, "frontend"));
}
