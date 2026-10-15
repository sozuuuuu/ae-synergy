import { createApp } from "./app.tsx";
import { config } from "./config.ts";
import { openDb } from "./db.ts";
import { importCharacters, loadAnadenData } from "./models/character-import.ts";
import { importEquipment, loadEquipmentData } from "./models/equipment.ts";

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

// 武器・防具も同じく、空なら取り込む
if (db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM equipment").get()!.n === 0) {
  try {
    const result = importEquipment(db, await loadEquipmentData(config.anadenEquipment));
    console.log(`装備の取り込み完了: 武器${result.weapons} / 防具${result.armors}`);
  } catch (error) {
    console.error("装備データの取り込みに失敗しました（装備なしで起動します）。anaden-mcp で `anaden export` を実行してください:", error);
  }
}

const app = createApp(db, { publicOrigin: config.publicOrigin }).listen({ port: config.port, hostname: config.host });

console.log(`AE Synergy: http://${app.server?.hostname}:${app.server?.port}`);
