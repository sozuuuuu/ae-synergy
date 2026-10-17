import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

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
  /** キャラデータ。anaden-mcp が書き出す、発動条件を構造化した補強済みデータだけを正とする */
  anadenData: env.ANADEN_DATA ?? join(homedir(), ".cache", "anaden-mcp", "characters.enriched.json"),
  /** 武器・防具。anaden-mcp が書き出すもの */
  anadenEquipment: env.ANADEN_EQUIPMENT ?? join(homedir(), ".cache", "anaden-mcp", "equipment.export.json"),
};
