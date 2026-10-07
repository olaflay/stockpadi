import { createServer } from "node:http";
import { createApp } from "./app.js";
import { assertRuntimeEnvironment } from "./shared/environment.js";

assertRuntimeEnvironment(process.env, "backend");
const port = Number(process.env.PORT ?? 8787);
const serviceName = process.env.SERVICE_NAME || "backend";
createServer(createApp()).listen(port, "0.0.0.0", () => console.log(`${serviceName} listening on ${port}`));
