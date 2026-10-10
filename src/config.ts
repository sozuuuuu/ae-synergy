import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const env = process.env;
const databasePath = env.DATABASE_PATH ?? (env.NODE_ENV === "test" ? ":memory:" : "storage/ae-synergy.sqlite3");
if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });

export const config = {
  port: Number(env.PORT ?? 3000),
  host: env.HOST ?? "127.0.0.1",
  databasePath,
  production: env.NODE_ENV === "production",
  /** Origin 検査用の公開 URL のオリジン（例: https://host.ts.net:8443）。未設定ならリクエストの Host と比較する */
  publicOrigin: env.PUBLIC_ORIGIN,
};
