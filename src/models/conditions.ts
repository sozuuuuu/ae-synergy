// 効果の発動条件を、今のパーティ編成で満たしているか判定する。
// 条件は anaden-mcp が構造化したもの（Clause）だけを読み、自由文は解釈しない。
// battle（戦闘の流れ次第）と unclassified（anaden-mcp の辞書にまだない）は判定せず unknown にする。
import type { Db } from "../db.ts";
import { ELEMENTS } from "./characters.ts";

type Who = { personalities: string[] } | { ls: string } | { gender: string } | { weapons: string[] };
export type Clause =
  | { slot: "main" | "sub" }
  | { neighbors: { personalities: string[] } }
  | { count: { region: "main" | "sub" | "all"; who: Who; min?: number; max?: number } }
  | { anyOf: Clause[][] }
  | { zone: { names: string[]; tier?: string } }
  | { anyZone: true }
  | { frontElements: { distinct?: boolean; min?: number; excludeSelf?: boolean } }
  | { selfState: string }
  | { enemyStatus: string[] }
  | { battle: string }
  | { unclassified: string };

export type CondMember = {
  id: number;
  slot: "main" | "sub";
  position: number;
  personalities: string[];
  ls_type: string | null;
  weapon: string;
  gender: string | null;
  /** このキャラが展開できる ZONE の種別（例: 極・烈火陣展開） */
  zones: string[];
  /** 自分の力でなれる状態（ルナティック・歌唱・祈祷） */
  states?: string[];
  /** 敵に付与できる状態異常（毒・猛毒・ペインなど。条件なしで付けられるもの） */
  inflicts?: string[];
};
export type Guest = Omit<CondMember, "slot" | "position">;

export type CondState = "met" | "unmet" | "unknown";
export type CondResult = { state: CondState; note: string };

const ZONE_TYPE = /^(極・|絶・)?(.+陣(・.+)?)展開$/;

/** 条件判定に使うキャラの情報（パーソナリティと展開できる ZONE）をまとめて読む */
export function loadCondMembers(db: Db, ids: number[]): Map<number, Guest> {
  const map = new Map<number, Guest>();
  if (ids.length === 0) return map;
  const params = Object.fromEntries(ids.map((id, i) => [`i${i}`, id]));
  const list = ids.map((_, i) => `$i${i}`).join(", ");
  for (const c of db.query<{ id: number; ls_type: string | null; weapon: string; gender: string | null }, any>(
    `SELECT id, ls_type, weapon, gender FROM characters WHERE id IN (${list})`,
  ).all(params)) {
    map.set(c.id, { ...c, personalities: [], zones: [], states: [], inflicts: [] });
  }
  for (const r of db.query<{ character_id: number; name: string }, any>(
    `SELECT cp.character_id, p.name FROM character_personalities cp JOIN personalities p ON p.id = cp.personality_id WHERE cp.character_id IN (${list})`,
  ).all(params)) {
    map.get(r.character_id)?.personalities.push(r.name);
  }
  for (const r of db.query<{ character_id: number; type: string }, any>(
    `SELECT DISTINCT character_id, type FROM character_effects WHERE character_id IN (${list}) AND type LIKE '%陣%展開'`,
  ).all(params)) {
    if (ZONE_TYPE.test(r.type)) map.get(r.character_id)?.zones.push(r.type);
  }
  // 自分にかけるルナティック（条件なし）・歌唱・祈祷を発動するスキルを持っていれば、その状態に自分でなれる。VC は使わない前提なので除く
  for (const r of db.query<{ character_id: number; state: string }, any>(
    `SELECT DISTINCT character_id, CASE WHEN type LIKE 'ルナティック(%' THEN 'ルナティック' ELSE type END AS state FROM character_effects
     WHERE character_id IN (${list}) AND source NOT LIKE 'VC Lv%' AND conditions = ''
       AND ((type LIKE 'ルナティック(%' AND scope = 'self') OR type IN ('歌唱', '祈祷'))`,
  ).all(params)) {
    map.get(r.character_id)?.states!.push(r.state);
  }
  for (const r of db.query<{ character_id: number; type: string }, any>(
    `SELECT DISTINCT character_id, type FROM character_effects
     WHERE character_id IN (${list}) AND scope = 'enemy' AND conditions = '' AND source NOT LIKE 'VC Lv%'
       AND type IN ('毒', '猛毒', 'ペイン', '睡眠', '封印', '気絶', '混乱', '石化', '凍結', '呪縛')`,
  ).all(params)) {
    map.get(r.character_id)?.inflicts!.push(r.type);
  }
  return map;
}

/**
 * subject はその効果を持つキャラ。パーティにいなければ guest（候補）として前衛に加えた前提で数える。
 * 本人の位置の条件は、候補なら置き場所を選べるので満たせる扱い、両隣は並び次第なので unknown。
 * zone を渡すと、「〜陣展開時」はパーティが張る ZONE（1つだけ）で判定する。候補が自分でその陣を張れるなら、張り替え次第なので unknown
 */
export function evaluateCondition(
  clauses: Clause[], text: string, subjectId: number, members: CondMember[], guest?: Guest, zone?: { active: { name: string; tier: string } | null },
): CondResult {
  const member = members.find((m) => m.id === subjectId);
  const subject: CondMember | null = member ?? (guest ? { ...guest, slot: "main", position: -1 } : null);
  const ctx: Ctx = { subject, isGuest: !member, all: !member && subject ? [...members, subject] : members, zone };
  const states = clauses.map((c) => judge(c, ctx));
  if (states.includes("unmet")) return { state: "unmet", note: `条件未達: ${text}` };
  if (states.every((s) => s === "met")) return { state: "met", note: `条件OK: ${text}` };
  return { state: "unknown", note: `条件: ${text}` };
}

type Ctx = { subject: CondMember | null; isGuest: boolean; all: CondMember[]; zone?: { active: { name: string; tier: string } | null } };
const ok = (b: boolean): CondState => (b ? "met" : "unmet");
const elementOf = (m: CondMember) => m.personalities.find((p) => (ELEMENTS as readonly string[]).includes(p)) ?? "";

function matches(m: CondMember, who: Who): boolean {
  if ("personalities" in who) return who.personalities.some((p) => m.personalities.includes(p));
  if ("ls" in who) return m.ls_type === who.ls;
  if ("gender" in who) return m.gender === who.gender;
  return who.weapons.includes(m.weapon);
}

function judge(c: Clause, { subject, isGuest, all, zone }: Ctx): CondState {
  if ("battle" in c || "unclassified" in c) return "unknown";
  if ("anyOf" in c) {
    const alts = c.anyOf.map((alt) => alt.map((x) => judge(x, { subject, isGuest, all, zone })));
    if (alts.some((a) => a.every((s) => s === "met"))) return "met";
    return alts.every((a) => a.includes("unmet")) ? "unmet" : "unknown";
  }
  if ("slot" in c) {
    if (!subject) return "unknown";
    return isGuest ? "met" : ok(subject.slot === c.slot);
  }
  if ("neighbors" in c) {
    if (!subject || isGuest) return "unknown";
    if (subject.slot !== "main") return "unmet";
    const side = (d: number) => all.find((x) => x.slot === "main" && x.position === subject.position + d);
    return ok([side(-1), side(1)].every((x) => x && c.neighbors.personalities.some((p) => x.personalities.includes(p))));
  }
  if ("count" in c) {
    const { region, who, min, max } = c.count;
    const n = all.filter((m) => (region === "all" || m.slot === region) && matches(m, who)).length;
    return ok((min === undefined || n >= min) && (max === undefined || n <= max));
  }
  if ("zone" in c) {
    const { names, tier } = c.zone;
    const canDeploy = (m: CondMember) => m.zones.some((z) => {
      const zm = z.match(ZONE_TYPE);
      return !!zm && names.includes(zm[2]!) && (!tier || zm[1] === tier);
    });
    if (!zone) return ok(all.some(canDeploy));
    const a = zone.active;
    if (a && names.includes(a.name) && (!tier || a.tier === tier)) return "met";
    return isGuest && subject && canDeploy(subject) ? "unknown" : "unmet";
  }
  if ("anyZone" in c) return zone ? ok(!!zone.active) : ok(all.some((m) => m.zones.length > 0));
  // 自分でその状態になれるなら満たす。なれなくても味方にしてもらえるかもしれないので unknown
  if ("selfState" in c) return subject?.states?.includes(c.selfState) ? "met" : "unknown";
  // 前衛の誰か（後衛は行動しない）がその状態異常を付けられるなら満たす
  if ("enemyStatus" in c) {
    return all.some((m) => m.slot === "main" && m.inflicts?.some((s) => c.enemyStatus.includes(s))) ? "met" : "unknown";
  }
  if ("frontElements" in c) {
    const { distinct, min, excludeSelf } = c.frontElements;
    const els = all.filter((m) => m.slot === "main" && !(excludeSelf && m.id === subject?.id)).map(elementOf);
    if (distinct) return ok(new Set(els).size === els.length);
    return ok(new Set(els.filter(Boolean)).size >= (min ?? 0));
  }
  return "unknown"; // anaden-mcp が知らない形を足しても、判定できないだけで壊れない
}
