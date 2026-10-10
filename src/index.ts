import { createApp } from "./app.tsx";
import { config } from "./config.ts";
import { openDb } from "./db.ts";
import { importCharacters, loadAnadenData } from "./models/character-import.ts";

const db = openDb(config.databasePath);

// キャラデータが空なら、anaden-mcp の補強済みデータから取り込んでから起動する（初回セットアップを省くため）
const count = db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM characters").get()!.n;
if (count === 0) {
  console.log(`キャラデータが空なので取り込みます (${config.anadenData}) ...`);
  try {
    const result = importCharacters(db, await loadAnadenData(config.anadenData));
    console.log(`取り込み完了: ${result.created}体`);
  } catch (error) {
    console.error("キャラデータの取り込みに失敗しました（データなしで起動します）。anaden-mcp で `anaden export` を実行してください:", error);
  }
}

const app = createApp(db, { publicOrigin: config.publicOrigin }).listen({ port: config.port, hostname: config.host });

console.log(`AE Synergy: http://${app.server?.hostname}:${app.server?.port}`);
