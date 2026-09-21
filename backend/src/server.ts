import { createServer } from "node:http";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 8787);
const brandName = process.env.BUSINESS_NAME || process.env.PLATFORM_NAME || "OjaPadi";
createServer(createApp()).listen(port, "0.0.0.0", () => console.log(`${brandName} backend listening on ${port}`));
