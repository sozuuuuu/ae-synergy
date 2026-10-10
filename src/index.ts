import { createApp } from "./app.tsx";
import { config } from "./config.ts";
import { openDb } from "./db.ts";

const db = openDb(config.databasePath);
const app = createApp(db, { publicOrigin: config.publicOrigin }).listen({ port: config.port, hostname: config.host });

console.log(`AE Synergy: http://${app.server?.hostname}:${app.server?.port}`);
