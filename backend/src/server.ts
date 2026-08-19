import { createServer } from "node:http";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 8787);
createServer(createApp()).listen(port, "0.0.0.0", () => console.log(`StockPadi backend listening on ${port}`));
