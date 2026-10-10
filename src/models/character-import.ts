import type { Db } from "../db.ts";
import { normalize } from "../lib/text.ts";
import { ELEMENTS, WEAPONS } from "./characters.ts";
import { extractEffects } from "./effect-extract.ts";

/**
 * anaden-mcp が書き出す補強済みのキャラデータ（各効果に構造化した発動条件 _condition がつく）を読む。
 * anaden-gear の生データは条件が自由文だけなので受け付けない。
 */
export async function loadAnadenData(path: string): Promise<unknown[]> {
  const file = Bun.file(path);
  if (!(await file.exists())) throw new Error(`${path} がありません。anaden-mcp で \`anaden export\` を実行してください`);
  const data = await file.json();
  if (data?.format !== "anaden-mcp/characters" || data.version !== 1 || !Array.isArray(data.characters)) {
    throw new Error(`${path} は anaden-mcp の補強済みデータ（format: anaden-mcp/characters, version: 1）ではありません`);
  }
  return data.characters;
}

const WEAPON_PERSONALITIES = new Set(Object.values(WEAPONS));
const personalityCategory = (name: string) =>
  (ELEMENTS as readonly string[]).includes(name) ? "element" : WEAPON_PERSONALITIES.has(name) ? "weapon" : "other";

// 長音（ー）は直前の音の母音として並べる
const VOWEL_ROWS: [string, string][] = [
  ["あ", "あかさたなはまやらわがざだばぱぁゃゎ"], ["い", "いきしちにひみりぎじぢびぴぃ"], ["う", "うくすつぬふむゆるぐずづぶぷぅゅっゔ"],
  ["え", "えけせてねへめれげぜでべぺぇ"], ["お", "おこそとのほもよろをごぞどぼぽぉょ"],
];
const VOWEL = new Map(VOWEL_ROWS.flatMap(([v, chars]) => [...chars].map((c) => [c, v] as const)));

/** 五十音順に並べるキー。漢字名は読みを使い、カタカナはひらがなにし、(AS) などの括弧は外す */
export function kanaSortKey(name: string, reading?: string | null): string {
  const hira = (reading || name)
    .replace(/[(（][^)）]*[)）]/g, "")
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/ゔ/g, "う"); // ヴはウの行に並べる
  let key = "";
  for (const c of hira) key += c === "ー" ? VOWEL.get(key.at(-1) ?? "") ?? "" : c;
  return key;
}

export type ImportResult = { created: number; updated: number; unchanged: number; total: number };

export function importCharacters(db: Db, rows: unknown): ImportResult {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("キャラクターデータが空か、配列ではありません");

  const nameCounts = new Map<string, number>();
  for (const row of rows) nameCounts.set(row.name, (nameCounts.get(row.name) ?? 0) + 1);

  const upsertPersonality = db.query<{ id: number }, any>(
    `INSERT INTO personalities (name, category) VALUES ($name, $category)
     ON CONFLICT(name) DO UPDATE SET category = excluded.category RETURNING id`,
  );
  const findCharacter = db.query<{ id: number; data: string }, any>("SELECT id, data FROM characters WHERE external_id = $external_id");
  const insertCharacter = db.query<{ id: number }, any>(
    `INSERT INTO characters (external_id, name, label, eng_name, class_name, true_name, style, rarity, weapon, armor, ls_type,
       element, gender, obtain, is_alter, is_sa, search_text, sort_key, data)
     VALUES ($external_id, $name, $label, $eng_name, $class_name, $true_name, $style, $rarity, $weapon, $armor, $ls_type,
       $element, $gender, $obtain, $is_alter, $is_sa, $search_text, $sort_key, $data) RETURNING id`,
  );
  const updateCharacter = db.query(
    `UPDATE characters SET name = $name, label = $label, eng_name = $eng_name, class_name = $class_name, true_name = $true_name,
       style = $style, rarity = $rarity, weapon = $weapon, armor = $armor, ls_type = $ls_type, element = $element,
       gender = $gender, obtain = $obtain, is_alter = $is_alter, is_sa = $is_sa, search_text = $search_text, sort_key = $sort_key,
       data = $data, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = $id`,
  );
  const clearPersonalities = db.query("DELETE FROM character_personalities WHERE character_id = $id");
  const addPersonality = db.query("INSERT OR IGNORE INTO character_personalities (character_id, personality_id) VALUES ($id, $pid)");
  const clearEffects = db.query("DELETE FROM character_effects WHERE character_id = $id");
  const addEffect = db.query(
    `INSERT INTO character_effects (character_id, type, scope, targets, value, turns, element, conditions, condition_clauses, personalities, description, source, search_text)
     VALUES ($id, $type, $scope, $targets, $value, $turns, $element, $conditions, $condition_clauses, $personalities, $description, $source, $search_text)`,
  );

  const result: ImportResult = { created: 0, updated: 0, unchanged: 0, total: rows.length };
  const personalityIds = new Map<string, number>();

  db.transaction(() => {
    // 同名キャラのラベルが入れ替わっても UNIQUE 制約に当たらないよう、一旦退避する
    db.exec("UPDATE characters SET label = '__tmp__' || id");

    for (const row of rows as any[]) {
      const personalities: string[] = Array.isArray(row.personalities) ? row.personalities : [];
      const { _id, ...data } = row;
      const json = JSON.stringify(data);
      const attrs = {
        external_id: String(_id),
        name: row.name,
        label: (nameCounts.get(row.name) ?? 0) > 1 ? `${row.name}〈${row.class}〉` : row.name,
        eng_name: row.engName ?? null,
        class_name: row.class ?? null,
        true_name: row.trueName ?? null,
        style: row.style,
        rarity: row.rarity,
        weapon: row.weaponType,
        armor: row.armorType ?? null,
        ls_type: row.lsType ?? null,
        element: personalities.find((p) => (ELEMENTS as readonly string[]).includes(p)) ?? null,
        gender: row.gender ?? null,
        obtain: row.obtain ?? null,
        is_alter: row.isAlter ? 1 : 0,
        is_sa: row.isSA ? 1 : 0,
        search_text: normalize([row.name, row.engName, row.class, row.trueName, row.reading].filter(Boolean).join(" ")),
        sort_key: kanaSortKey(row.name, row.reading),
        data: json,
      };

      const existing = findCharacter.get({ external_id: attrs.external_id });
      let id: number;
      if (existing) {
        id = existing.id;
        updateCharacter.run({ ...attrs, id });
        existing.data === json ? result.unchanged++ : result.updated++;
      } else {
        id = insertCharacter.get(attrs)!.id;
        result.created++;
      }

      clearPersonalities.run({ id });
      for (const name of personalities) {
        let pid = personalityIds.get(name);
        if (pid === undefined) {
          pid = upsertPersonality.get({ name, category: personalityCategory(name) })!.id;
          personalityIds.set(name, pid);
        }
        addPersonality.run({ id, pid });
      }

      clearEffects.run({ id });
      for (const effect of extractEffects(row)) {
        const search_text = normalize([effect.description, effect.type, effect.conditions, effect.source].join(" "));
        addEffect.run({ id, ...effect, search_text });
      }
    }

    // 取り込み元から消えたキャラ（ラベルが退避されたまま）は、パーティで使われていれば残し、なければ削除する
    const stale = db.query<{ id: number }, []>("SELECT id FROM characters WHERE label LIKE '\\_\\_tmp\\_\\_%' ESCAPE '\\'").all();
    for (const { id } of stale) {
      const used = db.query("SELECT 1 FROM party_members WHERE character_id = $id LIMIT 1").get({ id });
      if (used) db.query("UPDATE characters SET label = name || '〈旧データ' || id || '〉' WHERE id = $id").run({ id });
      else db.query("DELETE FROM characters WHERE id = $id").run({ id });
    }
  })();

  return result;
}
