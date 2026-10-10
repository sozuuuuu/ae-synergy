// 使い方: bun run import:characters [URL または JSON ファイル]
// 引数を省略すると環境変数 CHARACTER_SOURCE（.env に書いておく）を使う
import { openDb } from "../src/db.ts";
import { config } from "../src/config.ts";
import { importCharacters, loadSource } from "../src/models/character-import.ts";

const source = process.argv[2] ?? process.env.CHARACTER_SOURCE;
if (!source) {
  console.error("取り込み元を引数か CHARACTER_SOURCE で指定してください");
  process.exit(1);
}
console.log("Importing characters ...");
const db = openDb(config.databasePath);
const result = importCharacters(db, await loadSource(source));
const total = db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM characters").get()!.n;
console.log(`Done: ${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged (${total} in database)`);
