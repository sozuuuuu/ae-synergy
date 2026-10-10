import { createApp } from "./app.tsx";
import { config } from "./config.ts";
import { openDb } from "./db.ts";
import { importCharacters, loadSource } from "./models/character-import.ts";

const db = openDb(config.databasePath);

// キャラデータが空なら、CHARACTER_SOURCE から取り込んでから起動する（初回セットアップを省くため）
const count = db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM characters").get()!.n;
if (count === 0) {
  const source = process.env.CHARACTER_SOURCE;
  if (source) {
    console.log("キャラデータが空なので取り込みます ...");
    try {
      const result = importCharacters(db, await loadSource(source));
      console.log(`取り込み完了: ${result.created}体`);
    } catch (error) {
      console.error("キャラデータの取り込みに失敗しました（データなしで起動します）:", error);
    }
  } else {
    console.warn("キャラデータが空です。.env に CHARACTER_SOURCE を書くか、bun run import:characters を実行してください");
  }
}

const app = createApp(db, { publicOrigin: config.publicOrigin }).listen({ port: config.port, hostname: config.host });

console.log(`AE Synergy: http://${app.server?.hostname}:${app.server?.port}`);
