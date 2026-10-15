// 使い方: bun run build-party <アタッカー> [オプション]
// 火力（与ダメの目安）が一番伸びるように前衛を組む。--need で指定しなかった耐久・ボス対策の枠は、火力が同じくらいのときの決め手にしか使わない。
// ★の装備（既定はエルピス武器）で埋まる枠は、装備で簡単に付くのでキャラの評価には使わない。
//   --with A,B           ★のほかに必ず入れるキャラ（後衛に置くなら「名前:後衛」）
//   --without A,B        候補から外すキャラ
//   --weapon 名前|none   ★の武器（省略でエルピス）   --armor 名前   ★の防具（省略でなし）
//   --element 火 --kind 斬   攻撃の属性・攻撃種（省略時はアタッカーの攻撃スキルで一番多いもの）
//   --boss-element 水 --boss-attack physical|magic   想定ボスの攻撃
//   --need heal,barrier,buff_reversal   火力のほかに必ず満たす枠（耐久・ボス対策。一覧は --need help）
//   --enemy '{"level":140,"def":500}'   想定ボスの能力（キーは src/models/estimate.ts の ENEMY_FIELDS）
//   --size 4   前衛を何人まで組むか   --all   持っていないキャラも候補にする
//   --save     パーティとして保存する   --json   結果を JSON で出す
import { parseArgs } from "node:util";
import { config } from "../src/config.ts";
import { openDb } from "../src/db.ts";
import { BuildError, runBuild } from "../src/models/build-request.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    with: { type: "string", default: "" },
    without: { type: "string", default: "" },
    weapon: { type: "string" },
    armor: { type: "string" },
    element: { type: "string", default: "" },
    kind: { type: "string", default: "" },
    "boss-element": { type: "string", default: "" },
    "boss-attack": { type: "string", default: "" },
    need: { type: "string", default: "" },
    enemy: { type: "string", default: "{}" },
    size: { type: "string", default: "4" },
    all: { type: "boolean", default: false },
    save: { type: "boolean", default: false },
    json: { type: "boolean", default: false },
  },
});

const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

try {
  if (!positionals[0]) throw new BuildError("使い方: bun run build-party <アタッカー> [--with A,B] [--need heal,barrier] [--weapon 名前] [--save] [--json]");
  let enemy;
  try {
    enemy = JSON.parse(values.enemy);
  } catch {
    throw new BuildError("--enemy は JSON で書いてください");
  }
  const outcome = runBuild(openDb(config.databasePath), {
    attacker: positionals[0], with: list(values.with), without: list(values.without), weapon: values.weapon, armor: values.armor,
    element: values.element, kind: values.kind, bossElement: values["boss-element"], bossAttack: values["boss-attack"],
    need: list(values.need), enemy, size: Number(values.size) || 4, all: values.all, save: values.save,
  });
  console.log(values.json ? JSON.stringify(outcome.json, null, 2) : outcome.text);
} catch (error) {
  if (!(error instanceof BuildError)) throw error;
  console.error(error.message);
  process.exit(1);
}
