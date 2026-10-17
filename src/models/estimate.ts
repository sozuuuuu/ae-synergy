// 火力・被ダメの目安。計算は anaden-mcp のエンジン（wiki のダメージ計算式）に任せ、ここでは編成から入力を組み立てる。
// 枠を埋めている「そのまま効く（✓）」効果だけを数える。条件付き（△）・SB時のみ・装備・グラスタは入れない。
import { computeScenario, type Result, type Scenario, stackDecay } from "anaden-mcp/src/damage.js";
import type { Db } from "../db.ts";
import type { Member, Party } from "./parties.ts";
import { isGear } from "./equipment.ts";
import { type Coverage, type PartyContext, type Provider, zoneFits } from "./requirements.ts";

/**
 * 想定ボスの能力と味方の装備の仮定。パーティごとに parties.enemy（JSON）に入れたものだけを保存し、未入力は既定値で計算する。
 * 既定値は終盤の隠しボスを想定した大まかな値（実測ではない）。
 */
export const ENEMY_FIELDS = [
  { key: "level", label: "Lv", hint: "下克上の計算に使う（新八妖 120・第3部の隠しボス 140 が目安）", min: 1, max: 999, default: 140 },
  { key: "def", label: "防御", hint: "物理攻撃の守備値", min: 0, max: 99999, default: 300 },
  { key: "mdef", label: "魔防", hint: "魔法攻撃の守備値", min: 0, max: 99999, default: 300 },
  { key: "typeRes", label: "攻撃種耐性 %", hint: "常時の耐性バフ（Eバフ）。弱いならマイナス", min: -100, max: 500, default: 0 },
  { key: "elemRes", label: "属性耐性 %", hint: "常時の耐性バフ（Eバフ）。弱いならマイナス", min: -100, max: 500, default: 0 },
  { key: "atk", label: "攻撃（腕力・知性）", hint: "被ダメの計算に使う。物理なら腕力、魔法なら知性", min: 0, max: 99999, default: 600 },
  { key: "power", label: "技の威力 %", hint: "被ダメの計算に使う全体攻撃の倍率", min: 1, max: 100000, default: 150 },
  { key: "weapon", label: "武器の攻撃力・魔力", hint: "アタッカーの装備（仮定）", min: 0, max: 9999, default: 300 },
  { key: "armor", label: "防具の防御・魔防", hint: "味方の装備（仮定）", min: 0, max: 9999, default: 0 },
] as const;
export type EnemyKey = (typeof ENEMY_FIELDS)[number]["key"];
export const AFFINITIES = { weak: "弱点", resist: "耐性" } as const;
export type Enemy = Partial<Record<EnemyKey, number>> & { affinity?: keyof typeof AFFINITIES };
type Filled = Record<EnemyKey, number> & { affinity?: keyof typeof AFFINITIES };

/** 未入力を既定値で埋める。assumed は既定値を使った項目 */
export function withDefaults(enemy: Enemy): { values: Filled; assumed: (typeof ENEMY_FIELDS)[number][] } {
  const values = { ...enemy } as Filled;
  const assumed = ENEMY_FIELDS.filter((f) => enemy[f.key] == null);
  for (const f of assumed) values[f.key] = f.default;
  return { values, assumed };
}

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

/** 攻撃値の参照元（wiki の「〜依存」）。省略時は物理=腕力、魔法=知性 */
export type Dep = "str" | "int" | "spd";
/** rate は1hit の威力（%）、hits は攻撃回数 */
export type AttackSkill = { source: string; description: string; rate: number; hits: number; target: "single" | "all"; dep: Dep };

const DEP_TYPES: Record<string, Dep> = { 腕力依存: "str", 知性依存: "int", 速度依存: "spd" };

/** 自分で選んで撃たない攻撃（カウンター・リンク・チェイン）と、使わない前提の VC は除く */
const NOT_CHOSEN = "source NOT IN ('カウンター', 'リンク', 'リンクアビリティ', 'チェインアビリティ') AND source NOT LIKE 'VC Lv%'";
const hitsOf = (description: string) => Number(description.match(/攻撃(\d+)回/)?.[1] ?? 1);

/** アタッカーの攻撃スキルのうち、パーティの属性・攻撃種に一番合う、威力（1hit の威力×回数）の大きいもの */
export function attackSkill(db: Db, attackerId: number, element: string, kind: string): AttackSkill | null {
  const rows = db
    .query<{ type: string; value: number; element: string | null; targets: string; description: string; source: string }, any>(
      `SELECT type, value, element, targets, description, source FROM character_effects
       WHERE character_id = $id AND type IN ('斬攻撃', '突攻撃', '打攻撃', '魔法攻撃') AND value > 0 AND ${NOT_CHOSEN}`,
    )
    .all({ id: attackerId });
  const score = (r: (typeof rows)[number]) => (r.element === element ? 2 : 0) + (r.type === KIND_TYPES[kind] ? 1 : 0);
  const power = (r: (typeof rows)[number]) => r.value * hitsOf(r.description);
  const best = rows.sort((a, b) => score(b) - score(a) || power(b) - power(a))[0];
  if (!best) return null;
  // 「自身の腕力に応じた威力」などは、同じスキル（出典）の別の効果として入っている
  const depRow = db
    .query<{ type: string }, any>("SELECT type FROM character_effects WHERE character_id = $id AND source = $source AND type IN ('腕力依存', '知性依存', '速度依存') LIMIT 1")
    .get({ id: attackerId, source: best.source });
  const dep = depRow ? DEP_TYPES[depRow.type]! : kind === "魔法" ? "int" : "str";
  return { source: best.source, description: best.description, rate: best.value * 100, hits: hitsOf(best.description), target: best.targets.includes("単体") ? "single" : "all", dep };
}

/** 枠を ✓ で埋めている効果（キャラごとに一番良いもの） */
type Support = { key: string; type: string; value: number | null; characterId: number; scope: string; gear: boolean };

const supportsOf = (coverage: Coverage[], group: "damage" | "durability"): Support[] =>
  coverage
    .filter((c) => c.req.group === group)
    .flatMap((c) => c.providers.filter((p) => p.fit.level === "full").map((p) => toSupport(c.req.key, p)));

/**
 * 「最高累積回数N」の効果は最大まで重ねた効果量で数える。味方側の累積は2回目から元の効果量の半分ずつ足される
 * （×1.0 → ×1.5 → ×2.0 …。wiki: バフ・デバフまとめ 1-2-1）
 */
const stackRate = (description: string) => {
  const n = Number(description.match(/最高累積回数(\d+)/)?.[1] ?? 1);
  return 1 + 0.5 * (n - 1);
};

const toSupport = (key: string, p: Provider): Support => ({
  key, type: p.effect.type, value: p.effect.value == null ? null : p.effect.value * stackRate(p.effect.description),
  characterId: p.characterId, scope: p.effect.scope, gear: isGear(p.effect),
});

const ratios = (list: Support[], key: string, pick: (s: Support) => boolean = () => true) =>
  list.filter((s) => s.key === key && pick(s) && !/固定値/.test(s.type)).map((s) => (s.value ?? 0) / 100).filter((v) => v > 0);
const has = (list: Support[], key: string) => list.some((s) => s.key === key);

// ZONE の倍率（wiki: ZONEによるダメージ補正）。火水地風陰は 1.5 倍（極で 2 倍）、それ以外は 1.3 倍（極で 1.6 倍）
const BIG_ZONES: Record<string, string> = { 火: "烈火陣", 水: "水天陣", 地: "地裂陣", 風: "風王陣", 陰: "刻陰陣" };
export function zoneRate(type: string, element: string, kind: string): number {
  const name = type.replace(/展開$/, "");
  const awakened = name.startsWith("極・");
  const base = name.replace(/^極・/, "");
  if (zoneFits(type, element, kind)) return base === BIG_ZONES[element] ? (awakened ? 2 : 1.5) : (awakened ? 1.6 : 1.3);
  if (base === "月光陣" && ["陰", "雷", "晶"].includes(element)) return 1.3;
  return 1;
}

type Base = { stats: Stats; skill: AttackSkill; ctx: PartyContext; enemy: Filled; weapon: { atk: number; mag: number; name: string | null } };

function scenarioOf({ stats, skill, ctx, enemy, weapon: arms }: Base, all: Support[]): { scenario: Scenario; crit: boolean } {
  // 装備の下克上・属性攻撃UP は、スキルのものとは別の枠（装備の下克上・装備の属性強化）
  const gearOnly = (key: string) => all.filter((s) => s.gear && s.key === key);
  const list = all.filter((s) => !(s.gear && (s.key === "underdog" || s.key === "elem_atk_up")));
  const E = ctx.attackElement;
  const K = ctx.attackKind;
  const magic = K === "魔法";
  const res = (v: number) => (v >= 0 ? { up: [v / 100], down: [] } : { up: [], down: [-v / 100] });
  const typeRes = res(enemy.typeRes);
  const elemRes = res(enemy.elemRes);
  const zone = Math.max(1, ...list.filter((s) => s.key === "zone").map((s) => zoneRate(s.type, E, K)));
  const ambush = ratios(list, "ambush");
  // クリ率が 100% に届けばクリティカル前提で見る（捨身はクリ率 +100%）
  const critRate = ratios(list, "crit_rate").reduce((a, b) => a + b, 0) + (has(list, "abandon") ? 1 : 0);
  const scenario: Scenario = {
    attacker: { str: stats.pwr, int: stats.int, spd: stats.spd, maxMp: stats.mp, weaponAtk: arms.atk, weaponMag: arms.mag },
    buffs: {
      str: ratios(list, "stat_up", (s) => s.type.startsWith("腕力")), int: ratios(list, "stat_up", (s) => s.type.startsWith("知性")),
      spd: ratios(list, "stat_up", (s) => s.type.startsWith("速度")),
    },
    skill: { kind: magic ? "magic" : "physical", dep: skill.dep, hits: skill.hits, element: E && E !== "無" ? E : undefined, target: skill.target, rate: skill.rate },
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
        shingi: has(list, "unity"), seishin: has(list, "concentration"), gekokujo: has(list, "underdog"),
        koshi: has(list, "ambush") ? Math.max(0.6, ...ambush) : false,
      },
      elemAtkBuffs: ratios(list, "elem_atk_up"),
      equipElem: ratios(gearOnly("elem_atk_up"), "elem_atk_up"),
      equipGekokujo: gearOnly("underdog").map((s) => s.value ?? 0).filter((v) => v > 0),
      weaponBuffs: ratios(list, "weapon_up"),
      critDmg: ratios(list, "crit_dmg"),
      overcrit: has(list, "over_crit"),
      zone: zone > 1 ? { rate: zone } : undefined,
      // 歌唱・祈祷はそれぞれ1種類だけ（一番大きいもの）。ブレイクは1hit だけ2倍
      song: (() => { const v = Math.max(0, ...ratios(list, "song")); return v > 0 ? 1 + v : undefined; })(),
      break: has(list, "break_hit") || undefined,
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
  /** 計算に使った武器の攻撃力・魔力。name は★の武器から取ったとき（入力も武器もなければ既定値で null） */
  weapon: { atk: number; mag: number; name: string | null };
  result: Result;
  crit: boolean;
  avg: number;
  /** 支援なし（アタッカー本人の効果も含めて何もない状態）からの倍率 */
  multiplier: number;
  /** 枠ごとに、その枠の効果を外すとどれだけ下がるか（＝その枠で伸びている割合） */
  gains: Map<string, number>;
  /** 候補を入れたときの伸び */
  gainWith: (key: string, p: Provider) => number;
};

/** アタッカー（★）の与ダメの目安。★がいないかステータスや攻撃スキルが分からなければ null */
export function estimateDealt(db: Db, ctx: PartyContext, coverage: Coverage[], enemy: Enemy): Dealt | null {
  if (!ctx.attacker || !ctx.attackKind) return null;
  const stats = loadStats(db, [ctx.attacker.id]).get(ctx.attacker.id);
  const skill = attackSkill(db, ctx.attacker.id, ctx.attackElement, ctx.attackKind);
  if (!stats || !skill) return null;
  // 武器の攻撃力・魔力は、入力がなければ★の武器のもの、それもなければ既定値
  const filled = withDefaults(enemy).values;
  const arms = ctx.gear?.items.find((x) => x.kind === "weapon");
  const weapon = enemy.weapon == null && arms ? { atk: arms.stat1, mag: arms.stat2, name: arms.name } : { atk: filled.weapon, mag: filled.weapon, name: null };
  const base: Base = { stats, skill, ctx, enemy: filled, weapon };
  const list = supportsOf(coverage, "damage");
  const now = evaluate(base, list);
  const bare = evaluate(base, []);
  const gains = new Map<string, number>();
  for (const key of new Set(list.map((s) => s.key))) {
    const without = evaluate(base, list.filter((s) => s.key !== key)).avg;
    if (without > 0) gains.set(key, now.avg / without - 1);
  }
  return {
    skill, weapon, result: now.result, crit: now.crit, avg: now.avg,
    multiplier: bare.avg > 0 ? now.avg / bare.avg : 1,
    gains,
    gainWith: (key, p) => (now.avg > 0 ? evaluate(base, [...list, toSupport(key, p)]).avg / now.avg - 1 : 0),
  };
}

export type Taken = {
  member: Member;
  /** 想定ボスの攻撃を入れたときだけの実数（未入力なら null。ボスの攻撃は2乗で効くので、既定値では実数を出さない） */
  damage: number | null;
  hp: number;
  /** 支援（✓ の耐性UP・腕力/知性DOWN・バリアと本人のみの耐性）でどれだけ被ダメが減るか */
  reduction: number;
};

/**
 * 想定ボスの全体攻撃1回で、メンバーそれぞれが受けるダメージの目安。
 * 物理・魔法が未設定なら物理として計算する。クリティカル・ブレイク・敵のバフは入れない。
 */
export function estimateTaken(db: Db, party: Party, coverage: Coverage[], input: Enemy): Taken[] {
  const enemy = withDefaults(input).values;
  const magic = party.boss_attack === "magic";
  const list = supportsOf(coverage, "durability");
  // 本人のみの耐性・バリアは、そのキャラ自身にだけ効く
  const selfOnly = coverage
    .filter((c) => c.req.group === "durability")
    .flatMap((c) => c.providers.filter((p) => p.fit.level === "partial" && p.effect.scope === "self").map((p) => toSupport(c.req.key, p)));
  const element = party.boss_element && party.boss_element !== "無" ? party.boss_element : undefined;
  const stats = loadStats(db, party.members.map((m) => m.id));
  const hit = (s: Stats, supports: Support[]) => {
    // 敵の腕力（知性）は攻撃値A・Bの両方に入る
    const atk = enemy.atk * (1 - Math.min(1, stackDecay(ratios(supports, "enemy_atk_down"))));
    const barrier = Math.min(1, Math.max(0, ...ratios(supports, "barrier", (x) => x.type.startsWith("バリア"))));
    return computeScenario({
      attacker: { A: atk, B: atk, attr: enemy.atk },
      skill: { kind: magic ? "magic" : "physical", element, target: "all", rate: enemy.power },
      enemy: { def: s.end + enemy.armor, mdef: s.spr + enemy.armor },
      mods: {
        resist: { typeBuffs: ratios(supports, "res_up"), elemBuffs: ratios(supports, "elem_res_up") },
        barrier: barrier || undefined,
        single: false,
      },
    }).total.normal.avg;
  };
  return party.members.flatMap((member) => {
    const s = stats.get(member.id);
    if (!s) return [];
    const damage = hit(s, [...list, ...selfOnly.filter((x) => x.characterId === member.id)]);
    const bare = hit(s, []);
    return [{ member, damage: input.atk == null ? null : damage, hp: s.hp, reduction: bare > 0 ? 1 - damage / bare : 0 }];
  });
}
