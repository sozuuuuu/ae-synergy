// ★に持たせる武器・防具。装備の効果は装備者本人にだけ効くので、★の効果として枠の判定に足す。
// 装備で簡単に付く枠（例: エルピス武器の下克上・クリ率100%）は、ほかのキャラで埋める価値が低い（自動編成では数えない）。
import type { Db } from "../db.ts";
import { WEAPONS } from "./characters.ts";
import type { EffectRow } from "./requirements.ts";

export type Kind = "weapon" | "armor";
export const KIND_NAMES: Record<Kind, string> = { weapon: "武器", armor: "防具" };

export type Equipment = {
  id: number; external_id: string; kind: Kind; name: string; type: string;
  /** 武器は攻撃・魔力、防具は防御・魔防 */
  stat1: number; stat2: number;
  character_name: string | null; act_condition: string;
};

/** anaden-mcp が書き出す装備データ（equipment.export.json）を読む */
export async function loadEquipmentData(path: string): Promise<{ weapons: unknown[]; armors: unknown[] }> {
  const file = Bun.file(path);
  if (!(await file.exists())) throw new Error(`${path} がありません。anaden-mcp で \`anaden export\` を実行してください`);
  const data = await file.json();
  if (data?.format !== "anaden-mcp/equipment" || data.version !== 1 || !Array.isArray(data.weapons) || !Array.isArray(data.armors)) {
    throw new Error(`${path} は anaden-mcp の装備データ（format: anaden-mcp/equipment, version: 1）ではありません`);
  }
  return { weapons: data.weapons, armors: data.armors };
}

const STAT_UP = /^(腕力|知性|耐久|精神|速度|幸運|HP|MP|全ステータス)UP$/;
const clean = (s: unknown) => String(s ?? "").replace(/\s*\n\s*/g, "").replace(/<sup>2<\/sup>/g, "²").replace(/<[^>]+>/g, "");

/** 装備の効果を1種別1行に。「物理クリティカル率UP,魔法クリティカル率UP」のような複数種別は分ける */
function effectsOf(row: any): { type: string; value: number | null; conditions: string; description: string }[] {
  const out = [];
  for (const entry of Array.isArray(row?.ability) ? row.ability : []) {
    for (const e of Array.isArray(entry?.effects) ? entry.effects : []) {
      const description = clean(e?.description);
      const value = typeof e?.value === "number" ? e.value : null;
      for (const raw of String(e?.types ?? "").split(",").map((t) => t.trim()).filter(Boolean)) {
        // 「速度+30」のような % のないステータスUP は固定値
        const type = STAT_UP.test(raw) && !description.includes("%") ? `${raw}(固定値)` : raw;
        out.push({ type, value, conditions: clean(e?.conditions), description });
      }
    }
  }
  return out;
}

/** 装備を全部入れ替える（パーティは external_id で参照するので、入れ替えても選んだ装備は残る） */
export function importEquipment(db: Db, data: { weapons: unknown[]; armors: unknown[] }): { weapons: number; armors: number } {
  return db.transaction(() => {
    db.exec("DELETE FROM equipment");
    const insert = db.query<{ id: number }, any>(
      `INSERT INTO equipment (external_id, kind, name, type, stat1, stat2, character_name, act_condition, data)
       VALUES ($externalId, $kind, $name, $type, $stat1, $stat2, $characterName, $actCondition, $data) RETURNING id`,
    );
    const insertEffect = db.query(
      "INSERT INTO equipment_effects (equipment_id, type, value, conditions, description) VALUES ($equipmentId, $type, $value, $conditions, $description)",
    );
    const put = (kind: Kind, rows: unknown[]) => {
      let n = 0;
      for (const row of rows as any[]) {
        if (!row?._id || !row?.name || !row?.types) continue;
        const [stat1, stat2] = kind === "weapon" ? [row.attack, row.magic] : [row.defense, row.magicDefense];
        const id = insert.get({
          externalId: String(row._id), kind, name: clean(row.name), type: String(row.types),
          stat1: Number(stat1) || 0, stat2: Number(stat2) || 0, characterName: row.characterName || null,
          actCondition: clean(row.actCondition), data: JSON.stringify(row),
        })!.id;
        for (const e of effectsOf(row)) insertEffect.run({ equipmentId: id, ...e });
        n++;
      }
      return n;
    };
    return { weapons: put("weapon", data.weapons), armors: put("armor", data.armors) };
  })();
}

const COLUMNS = "id, external_id, kind, name, type, stat1, stat2, character_name, act_condition";

/** 種類ごとの選択肢（汎用を先に） */
export const equipmentOfType = (db: Db, kind: Kind, type: string) =>
  db.query<Equipment, any>(`SELECT ${COLUMNS} FROM equipment WHERE kind = $kind AND type = $type ORDER BY character_name IS NOT NULL, name`)
    .all({ kind, type });

/** 名前（完全一致優先）から。kind と type で絞れる */
export function findEquipment(db: Db, name: string, kind?: Kind, type?: string): Equipment | null {
  const rows = db.query<Equipment, any>(`SELECT ${COLUMNS} FROM equipment WHERE name LIKE $like ORDER BY name = $name DESC, length(name)`)
    .all({ like: `%${name}%`, name });
  return rows.find((r) => (!kind || r.kind === kind) && (!type || r.type === type)) ?? null;
}

/**
 * パーティの装備の設定から、★に持たせる装備。
 * 武器: '' = 武器種のエルピス / 'none' = なし / external_id。防具: '' = なし / external_id
 */
export function resolveEquipment(db: Db, kind: Kind, setting: string, type: string | null): Equipment | null {
  if (setting === "none") return null;
  if (setting) return db.query<Equipment, any>(`SELECT ${COLUMNS} FROM equipment WHERE external_id = $id AND kind = $kind`).get({ id: setting, kind });
  if (kind === "armor" || !type) return null;
  return db.query<Equipment, any>(
    `SELECT ${COLUMNS} FROM equipment WHERE kind = 'weapon' AND type = $type AND character_name IS NULL AND name LIKE 'エルピス%' ORDER BY id LIMIT 1`,
  ).get({ type });
}

export const GEAR_SOURCE = { weapon: "武器:", armor: "防具:" } as const;
export const isGear = (e: Pick<EffectRow, "source">) => e.source.startsWith(GEAR_SOURCE.weapon) || e.source.startsWith(GEAR_SOURCE.armor);

/**
 * 装備の効果を★本人の効果として（枠の判定用）。発動条件（例: 槌装備者）を満たさなければ何も効かない。
 * 「特殊環境時」などの条件付きの効果は判定できないので △ になるようにする
 */
export function gearEffects(db: Db, item: Equipment, wearer: { id: number; weapon: string }): EffectRow[] {
  if (item.act_condition && item.act_condition !== `${WEAPONS[wearer.weapon] ?? wearer.weapon}装備者`) return [];
  return db
    .query<{ type: string; value: number | null; conditions: string; description: string }, any>(
      "SELECT type, value, conditions, description FROM equipment_effects WHERE equipment_id = $id",
    )
    .all({ id: item.id })
    .map((e) => ({
      character_id: wearer.id, type: e.type, scope: "self", targets: "自身", value: e.value, turns: null,
      conditions: e.conditions, condition_clauses: e.conditions ? JSON.stringify([{ unclassified: e.conditions }]) : "[]",
      personalities: "", description: e.description, source: `${GEAR_SOURCE[item.kind]}${item.name}`,
    }));
}
