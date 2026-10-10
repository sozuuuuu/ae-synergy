import type { Db } from "../db.ts";
import { keywords, likePattern } from "../lib/text.ts";

export const STYLES = ["NS", "AS", "ES"] as const;
export const ELEMENTS = ["火", "地", "水", "風", "雷", "陰", "晶", "無"] as const;
export const WEAPONS: Record<string, string> = {
  sword: "剣", katana: "刀", ax: "斧", lance: "槍", bow: "弓", fists: "拳", hammer: "槌", staff: "杖",
};
export const ARMORS: Record<string, string> = { ring: "指輪", bangle: "腕輪", necklace: "首飾り" };
export const LS_TYPES = ["天", "冥"] as const;
export const STAT_NAMES: Record<string, string> = {
  hp: "HP", mp: "MP", pwr: "腕力", int: "知性", end: "耐久", spr: "精神", spd: "速度", lck: "幸運",
};

/** 詳細ページに出す区分（取り込み元のキー => 見出し）。skills は別扱い。 */
export const SECTIONS: [string, string][] = [
  ["valorChant", "ヴァラーチャント"],
  ["abilities", "アビリティ"],
  ["uniqueAbility", "固有アビリティ"],
  ["lsAbility", "天冥アビリティ"],
  ["sbEnhance", "SB強化"],
  ["stack", "蓄積"],
  ["modeChange", "モードチェンジ"],
  ["specialState", "特殊状態"],
  ["sing", "歌唱"],
  ["singActivate", "歌唱発動"],
  ["counter", "カウンター"],
  ["link", "リンク"],
  ["linkAbility", "リンクアビリティ"],
  ["chainAbility", "チェインアビリティ"],
  ["zoneAbility", "ZONEアビリティ"],
  ["prayer", "祈り"],
  ["prayerActivate", "祈り発動"],
  ["resonance", "共鳴"],
  ["resonanceSkill", "共鳴スキル"],
  ["anotherSense", "アナザーセンス"],
  ["exSpecialMove", "EX必殺技"],
];

export type CharacterSummary = {
  id: number;
  name: string;
  label: string;
  class_name: string | null;
  style: string;
  rarity: number;
  weapon: string;
  armor: string | null;
  ls_type: string | null;
  element: string | null;
  is_alter: number;
  is_sa: number;
};

export type Character = CharacterSummary & {
  external_id: string;
  eng_name: string | null;
  true_name: string | null;
  gender: string | null;
  obtain: string | null;
  data: Record<string, any>;
  personalities: { name: string; category: string }[];
};

const SUMMARY_COLUMNS = "c.id, c.name, c.label, c.class_name, c.style, c.rarity, c.weapon, c.armor, c.ls_type, c.element, c.is_alter, c.is_sa";

export type CharacterFilters = {
  q?: string;
  effect?: string;
  style?: string;
  weapon?: string;
  element?: string;
  ls?: string;
  alter?: string;
  personality?: string[];
};

function filterSql(f: CharacterFilters) {
  const where: string[] = [];
  const params: Record<string, string | number> = {};
  keywords(f.q).forEach((word, i) => {
    where.push(`c.search_text LIKE $q${i} ESCAPE '\\'`);
    params[`q${i}`] = likePattern(word);
  });
  // 効果キーワードは、同じ1つの効果の中にすべて含まれるもの（AND）
  const effect = effectCondition(f.effect, "e", params);
  if (effect) where.push(`EXISTS (SELECT 1 FROM character_effects e WHERE e.character_id = c.id AND ${effect})`);
  if (f.style && (STYLES as readonly string[]).includes(f.style)) {
    where.push("c.style = $style");
    params.style = f.style;
  }
  if (f.weapon && f.weapon in WEAPONS) {
    where.push("c.weapon = $weapon");
    params.weapon = f.weapon;
  }
  if (f.ls && (LS_TYPES as readonly string[]).includes(f.ls)) {
    where.push("c.ls_type = $ls");
    params.ls = f.ls;
  }
  if (f.alter === "1") where.push("c.is_alter = 1");
  const personalities = [...(f.personality ?? [])];
  if (f.element && (ELEMENTS as readonly string[]).includes(f.element)) personalities.push(f.element);
  [...new Set(personalities)].slice(0, 10).forEach((name, i) => {
    where.push(`EXISTS (SELECT 1 FROM character_personalities cp JOIN personalities p ON p.id = cp.personality_id
      WHERE cp.character_id = c.id AND p.name = $p${i})`);
    params[`p${i}`] = name;
  });
  return { where: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

/** 効果キーワードの条件（character_effects の別名 alias に対して）。キーワードがなければ null */
function effectCondition(query: string | undefined, alias: string, params: Record<string, string | number>): string | null {
  const words = keywords(query);
  if (words.length === 0) return null;
  return words
    .map((word, i) => {
      params[`ew${i}`] = likePattern(word);
      return `${alias}.search_text LIKE $ew${i} ESCAPE '\\'`;
    })
    .join(" AND ");
}

export function searchCharacters(db: Db, filters: CharacterFilters, { page = 1, perPage = 60 } = {}) {
  const { where, params } = filterSql(filters);
  const total = db.query<{ n: number }, any>(`SELECT COUNT(*) AS n FROM characters c ${where}`).get(params)!.n;
  const rows = db
    .query<CharacterSummary, any>(`SELECT ${SUMMARY_COLUMNS} FROM characters c ${where} ORDER BY c.name, c.style, c.id LIMIT $limit OFFSET $offset`)
    .all({ ...params, limit: perPage, offset: (page - 1) * perPage });
  const matches = matchingEffects(db, rows.map((r) => r.id), filters.effect);
  const characters = rows.map((row) => ({ ...row, matches: matches.get(row.id) ?? [] }));
  return { characters, total, page, pages: Math.max(1, Math.ceil(total / perPage)) };
}

export function getCharacter(db: Db, id: number): Character | null {
  const row = db.query<any, any>("SELECT * FROM characters WHERE id = $id").get({ id });
  if (!row) return null;
  const personalities = db
    .query<{ name: string; category: string }, any>(
      `SELECT p.name, p.category FROM character_personalities cp JOIN personalities p ON p.id = cp.personality_id
       WHERE cp.character_id = $id ORDER BY CASE p.category WHEN 'element' THEN 0 WHEN 'weapon' THEN 1 ELSE 2 END, p.name`,
    )
    .all({ id });
  return { ...row, data: JSON.parse(row.data), personalities };
}

export function charactersByLabels(db: Db, labels: string[]): Map<string, CharacterSummary> {
  if (labels.length === 0) return new Map();
  const placeholders = labels.map((_, i) => `$l${i}`).join(", ");
  const params = Object.fromEntries(labels.map((label, i) => [`l${i}`, label]));
  const rows = db.query<CharacterSummary, any>(`SELECT ${SUMMARY_COLUMNS} FROM characters c WHERE c.label IN (${placeholders})`).all(params);
  return new Map(rows.map((row) => [row.label, row]));
}

/** 投稿フォームの候補（datalist）用 */
export function allCharacterOptions(db: Db) {
  return db.query<{ label: string; class_name: string | null; style: string }, []>(
    "SELECT label, class_name, style FROM characters ORDER BY name, style, id",
  ).all();
}

export function listPersonalities(db: Db) {
  return db.query<{ name: string; category: string; count: number }, []>(
    `SELECT p.name, p.category, COUNT(cp.character_id) AS count FROM personalities p
     LEFT JOIN character_personalities cp ON cp.personality_id = p.id
     GROUP BY p.id ORDER BY count DESC, p.name`,
  ).all();
}

/** 効果キーワードに一致した効果の説明（検索結果のハイライト用）。キャラごとに最大 limit 件 */
export function matchingEffects(db: Db, characterIds: number[], query: string | undefined, limit = 3): Map<number, string[]> {
  const map = new Map<number, string[]>();
  const params: Record<string, string | number> = {};
  const condition = effectCondition(query, "e", params);
  if (!condition || characterIds.length === 0) return map;
  characterIds.forEach((id, i) => (params[`c${i}`] = id));
  const rows = db
    .query<{ character_id: number; text: string }, any>(
      `SELECT e.character_id, CASE WHEN e.description <> '' THEN e.description ELSE e.type END AS text
       FROM character_effects e WHERE e.character_id IN (${characterIds.map((_, i) => `$c${i}`).join(", ")}) AND ${condition}
       ORDER BY e.character_id, e.id`,
    )
    .all(params);
  for (const { character_id, text } of rows) {
    const list = map.get(character_id) ?? [];
    if (list.length < limit && !list.includes(text)) list.push(text);
    map.set(character_id, list);
  }
  return map;
}

export function charactersByIds(db: Db, ids: number[]): Map<number, CharacterSummary> {
  if (ids.length === 0) return new Map();
  const params = Object.fromEntries(ids.map((id, i) => [`i${i}`, id]));
  const rows = db.query<CharacterSummary, any>(`SELECT ${SUMMARY_COLUMNS} FROM characters c WHERE c.id IN (${ids.map((_, i) => `$i${i}`).join(", ")})`).all(params);
  return new Map(rows.map((row) => [row.id, row]));
}
