// 使い方: bun run import:characters [補強済み JSON ファイル]
// 引数を省略すると anaden-mcp の書き出し先（ANADEN_DATA で変更可）を使う
import { openDb } from "../src/db.ts";
import { config } from "../src/config.ts";
import { importCharacters, loadAnadenData } from "../src/models/character-import.ts";

const source = process.argv[2] ?? config.anadenData;
console.log(`Importing characters from ${source} ...`);
const db = openDb(config.databasePath);
const result = importCharacters(db, await loadAnadenData(source));
const total = db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM characters").get()!.n;
console.log(`Done: ${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged (${total} in database)`);
