// 火力・被ダメの目安。計算は anaden-mcp のエンジン（wiki のダメージ計算式）に任せ、ここでは編成から入力を組み立てる。
// 枠を埋めている「そのまま効く（✓）」効果だけを数える。条件付き（△）・SB時のみ・装備・グラスタは入れない。
import { computeScenario, type Result, type Scenario, stackDecay } from "anaden-mcp/src/damage.js";
import type { Db } from "../db.ts";
import type { Member, Party } from "./parties.ts";
import { type Coverage, type PartyContext, type Provider, zoneFits } from "./requirements.ts";

/** 想定ボスの能力と味方の装備の仮定。パーティごとに parties.enemy（JSON）に入れる。未入力は undefined */
export const ENEMY_FIELDS = [
  { key: "level", label: "Lv", hint: "下克上の計算に使う（新八妖 120・第3部の隠しボス 140 が目安）", min: 1, max: 999 },
  { key: "def", label: "防御", hint: "物理攻撃の守備値", min: 0, max: 99999 },
  { key: "mdef", label: "魔防", hint: "魔法攻撃の守備値", min: 0, max: 99999 },
  { key: "typeRes", label: "攻撃種耐性 %", hint: "常時の耐性バフ（Eバフ）。弱いならマイナス", min: -100, max: 500 },
  { key: "elemRes", label: "属性耐性 %", hint: "常時の耐性バフ（Eバフ）。弱いならマイナス", min: -100, max: 500 },
  { key: "atk", label: "攻撃（腕力・知性）", hint: "被ダメの計算に使う。物理なら腕力、魔法なら知性", min: 0, max: 99999 },
  { key: "power", label: "技の威力 %", hint: "全体攻撃の倍率。未入力なら 100%", min: 1, max: 100000 },
  { key: "weapon", label: "武器の攻撃力・魔力", hint: "アタッカーの装備（仮定）。未入力なら 300", min: 0, max: 9999 },
  { key: "armor", label: "防具の防御・魔防", hint: "味方の装備（仮定）。未入力なら 0", min: 0, max: 9999 },
] as const;
export type EnemyKey = (typeof ENEMY_FIELDS)[number]["key"];
export const AFFINITIES = { weak: "弱点", resist: "耐性" } as const;
export type Enemy = Partial<Record<EnemyKey, number>> & { affinity?: keyof typeof AFFINITIES };

const DEFAULT_WEAPON = 300;
const DEFAULT_POWER = 100;

export function parseEnemy(json: string): Enemy {
  let raw: any;
  try {
    raw = JSON.parse(json);
  } catch {
    return {};
  }
  const enemy: Enemy = {};
  for (const f of ENEMY_FIELDS) {
    const v = raw?.[f.key];
    if (typeof v === "number" && Number.isFinite(v) && v >= f.min && v <= f.max) enemy[f.key] = v;
  }
  if (raw?.affinity in AFFINITIES) enemy.affinity = raw.affinity;
  return enemy;
}

/** フォーム（enemy_<key>）から読む。空欄は未入力 */
export function enemyFromForm(fields: Record<string, string>): { enemy: Enemy; errors: string[] } {
  const enemy: Enemy = {};
  const errors: string[] = [];
  for (const f of ENEMY_FIELDS) {
    const text = (fields[`enemy_${f.key}`] ?? "").trim();
    if (!text) continue;
    const v = Number(text);
    if (!Number.isFinite(v) || v < f.min || v > f.max) errors.push(`想定ボスの「${f.label}」は ${f.min}〜${f.max} の数で入れてください`);
    else enemy[f.key] = v;
  }
  const affinity = fields.enemy_affinity ?? "";
  if (affinity in AFFINITIES) enemy.affinity = affinity as Enemy["affinity"];
  return { enemy, errors };
}

type Stats = { hp: number; mp: number; pwr: number; int: number; end: number; spr: number; spd: number };

function loadStats(db: Db, ids: number[]): Map<number, Stats> {
  if (ids.length === 0) return new Map();
  const rows = db
    .query<{ id: number; stats: string | null }, any>(
      `SELECT id, json_extract(data, '$.stats.lvMax') AS stats FROM characters WHERE id IN (${ids.map((_, i) => `$i${i}`).join(", ")})`,
    )
    .all(Object.fromEntries(ids.map((id, i) => [`i${i}`, id])));
  const map = new Map<number, Stats>();
  for (const r of rows) {
    const s = r.stats ? JSON.parse(r.stats) : null;
    if (s) map.set(r.id, { hp: s.hp ?? 0, mp: s.mp ?? 0, pwr: s.pwr ?? 0, int: s.int ?? 0, end: s.end ?? 0, spr: s.spr ?? 0, spd: s.spd ?? 0 });
  }
  return map;
}

const KIND_TYPES: Record<string, string> = { 斬: "斬攻撃", 突: "突攻撃", 打: "打攻撃", 魔法: "魔法攻撃" };

export type AttackSkill = { source: string; description: string; rate: number; target: "single" | "all" };

/** アタッカーの攻撃スキルのうち、パーティの属性・攻撃種に一番合う、威力の大きいもの */
function attackSkill(db: Db, attackerId: number, element: string, kind: string): AttackSkill | null {
  const rows = db
    .query<{ type: string; value: number; element: string | null; targets: string; description: string; source: string }, any>(
      `SELECT type, value, element, targets, description, source FROM character_effects
       WHERE character_id = $id AND type IN ('斬攻撃', '突攻撃', '打攻撃', '魔法攻撃') AND value > 0`,
    )
    .all({ id: attackerId });
  const score = (r: (typeof rows)[number]) => (r.element === element ? 2 : 0) + (r.type === KIND_TYPES[kind] ? 1 : 0);
  const best = rows.sort((a, b) => score(b) - score(a) || b.value - a.value)[0];
  if (!best) return null;
  return { source: best.source, description: best.description, rate: best.value * 100, target: best.targets.includes("単体") ? "single" : "all" };
}

/** 枠を ✓ で埋めている効果（キャラごとに一番良いもの） */
type Support = { key: string; type: string; value: number | null; characterId: number; scope: string };

const supportsOf = (coverage: Coverage[], group: "damage" | "durability"): Support[] =>
  coverage
    .filter((c) => c.req.group === group)
    .flatMap((c) => c.providers.filter((p) => p.fit.level === "full").map((p) => toSupport(c.req.key, p)));

const toSupport = (key: string, p: Provider): Support =>
  ({ key, type: p.effect.type, value: p.effect.value, characterId: p.characterId, scope: p.effect.scope });

const ratios = (list: Support[], key: string, pick: (s: Support) => boolean = () => true) =>
  list.filter((s) => s.key === key && pick(s) && !/固定値/.test(s.type)).map((s) => (s.value ?? 0) / 100).filter((v) => v > 0);
const has = (list: Support[], key: string) => list.some((s) => s.key === key);

// ZONE の倍率（wiki: ZONEによるダメージ補正）。火水地風陰は 1.5 倍（極で 2 倍）、それ以外は 1.3 倍（極で 1.6 倍）
const BIG_ZONES: Record<string, string> = { 火: "烈火陣", 水: "水天陣", 地: "地裂陣", 風: "風王陣", 陰: "刻陰陣" };
function zoneRate(type: string, element: string, kind: string): number {
  const name = type.replace(/展開$/, "");
  const awakened = name.startsWith("極・");
  const base = name.replace(/^極・/, "");
  if (zoneFits(type, element, kind)) return base === BIG_ZONES[element] ? (awakened ? 2 : 1.5) : (awakened ? 1.6 : 1.3);
  if (base === "月光陣" && ["陰", "雷", "晶"].includes(element)) return 1.3;
  return 1;
}

type Base = { stats: Stats; skill: AttackSkill; ctx: PartyContext; enemy: Enemy };

function scenarioOf({ stats, skill, ctx, enemy }: Base, list: Support[]): { scenario: Scenario; crit: boolean } {
  const E = ctx.attackElement;
  const K = ctx.attackKind;
  const magic = K === "魔法";
  const res = (v: number | undefined) => (v == null ? { up: [], down: [] } : v >= 0 ? { up: [v / 100], down: [] } : { up: [], down: [-v / 100] });
  const typeRes = res(enemy.typeRes);
  const elemRes = res(enemy.elemRes);
  const weapon = enemy.weapon ?? DEFAULT_WEAPON;
  const zone = Math.max(1, ...list.filter((s) => s.key === "zone").map((s) => zoneRate(s.type, E, K)));
  const ambush = ratios(list, "ambush");
  // クリ率が 100% に届けばクリティカル前提で見る（捨身はクリ率 +100%）
  const critRate = ratios(list, "crit_rate").reduce((a, b) => a + b, 0) + (has(list, "abandon") ? 1 : 0);
  const scenario: Scenario = {
    attacker: { str: stats.pwr, int: stats.int, spd: stats.spd, maxMp: stats.mp, weaponAtk: weapon, weaponMag: weapon },
    buffs: { str: ratios(list, "stat_up", (s) => s.type.startsWith("腕力")), int: ratios(list, "stat_up", (s) => s.type.startsWith("知性")) },
    skill: { kind: magic ? "magic" : "physical", element: E && E !== "無" ? E : undefined, target: skill.target, rate: skill.rate },
    enemy: {
      level: enemy.level, def: enemy.def, mdef: enemy.mdef, defDebuffs: ratios(list, "def_down"),
      affinity: enemy.affinity ?? "normal",
    },
    weakBuff: has(list, "weak"),
    lunatic: { shingan: has(list, "insight"), shasin: has(list, "abandon") },
    mods: {
      resist: {
        typeDebuffs: [...ratios(list, "type_res_down"), ...typeRes.down], typeBuffs: typeRes.up,
        elemDebuffs: [...ratios(list, "elem_res_down"), ...elemRes.down], elemBuffs: elemRes.up,
      },
      special: {
        shingi: has(list, "unity"), seishin: has(list, "concentration"), gekokujo: has(list, "underdog") && enemy.level != null,
        koshi: has(list, "ambush") ? Math.max(0.6, ...ambush) : false,
      },
      elemAtkBuffs: ratios(list, "elem_atk_up"),
      weaponBuffs: ratios(list, "weapon_up"),
      critDmg: ratios(list, "crit_dmg"),
      overcrit: has(list, "over_crit"),
      zone: zone > 1 ? { rate: zone } : undefined,
    },
  };
  return { scenario, crit: critRate >= 1 };
}

const evaluate = (base: Base, list: Support[]) => {
  const { scenario, crit } = scenarioOf(base, list);
  const result = computeScenario(scenario);
  return { result, crit, avg: result.total[crit ? "crit" : "normal"].avg };
};

export type Dealt = {
  skill: AttackSkill;
  result: Result;
  crit: boolean;
  avg: number;
  /** 支援なし（アタッカー本人の効果も含めて何もない状態）からの倍率 */
  multiplier: number;
  /** 枠ごとに、その枠の効果を外すとどれだけ下がるか（＝その枠で伸びている割合） */
  gains: Map<string, number>;
  /** 候補を入れたときの伸び */
  gainWith: (key: string, p: Provider) => number;
  weaponAssumed: boolean;
};

/** アタッカー（★）の与ダメの目安。★がいないかステータスや攻撃スキルが分からなければ null */
export function estimateDealt(db: Db, ctx: PartyContext, coverage: Coverage[], enemy: Enemy): Dealt | null {
  if (!ctx.attacker || !ctx.attackKind) return null;
  const stats = loadStats(db, [ctx.attacker.id]).get(ctx.attacker.id);
  const skill = attackSkill(db, ctx.attacker.id, ctx.attackElement, ctx.attackKind);
  if (!stats || !skill) return null;
  const base: Base = { stats, skill, ctx, enemy };
  const list = supportsOf(coverage, "damage");
  const now = evaluate(base, list);
  const bare = evaluate(base, []);
  const gains = new Map<string, number>();
  for (const key of new Set(list.map((s) => s.key))) {
    const without = evaluate(base, list.filter((s) => s.key !== key)).avg;
    if (without > 0) gains.set(key, now.avg / without - 1);
  }
  return {
    skill, result: now.result, crit: now.crit, avg: now.avg,
    multiplier: bare.avg > 0 ? now.avg / bare.avg : 1,
    gains,
    gainWith: (key, p) => (now.avg > 0 ? evaluate(base, [...list, toSupport(key, p)]).avg / now.avg - 1 : 0),
    weaponAssumed: enemy.weapon == null,
  };
}

export type Taken = { member: Member; damage: number; hp: number };

/**
 * 想定ボスの全体攻撃1回で、メンバーそれぞれが受けるダメージの目安。
 * 物理・魔法と攻撃（腕力・知性）が入っていなければ null。クリティカル・ブレイク・敵のバフは入れない。
 */
export function estimateTaken(db: Db, party: Party, coverage: Coverage[], enemy: Enemy): Taken[] | null {
  if (!party.boss_attack || enemy.atk == null) return null;
  const magic = party.boss_attack === "magic";
  const list = supportsOf(coverage, "durability");
  // 本人のみの耐性・バリアは、そのキャラ自身にだけ効く
  const selfOnly = coverage
    .filter((c) => c.req.group === "durability")
    .flatMap((c) => c.providers.filter((p) => p.fit.level === "partial" && p.effect.scope === "self").map((p) => toSupport(c.req.key, p)));
  // 敵の腕力（知性）は攻撃値A・Bの両方に入る
  const atk = enemy.atk * (1 - Math.min(1, stackDecay(ratios(list, "enemy_atk_down"))));
  const element = party.boss_element && party.boss_element !== "無" ? party.boss_element : undefined;
  const stats = loadStats(db, party.members.map((m) => m.id));
  return party.members.flatMap((member) => {
    const s = stats.get(member.id);
    if (!s) return [];
    const mine = [...list, ...selfOnly.filter((x) => x.characterId === member.id)];
    const barrier = Math.min(1, Math.max(0, ...ratios(mine, "barrier", (x) => x.type.startsWith("バリア"))));
    const result = computeScenario({
      attacker: { A: atk, B: atk, attr: enemy.atk },
      skill: { kind: magic ? "magic" : "physical", element, target: "all", rate: enemy.power ?? DEFAULT_POWER },
      enemy: { def: s.end + (enemy.armor ?? 0), mdef: s.spr + (enemy.armor ?? 0) },
      mods: {
        resist: { typeBuffs: ratios(mine, "res_up"), elemBuffs: ratios(mine, "elem_res_up") },
        barrier: barrier || undefined,
        single: false,
      },
    });
    return [{ member, damage: result.total.normal.avg, hp: s.hp }];
  });
}
