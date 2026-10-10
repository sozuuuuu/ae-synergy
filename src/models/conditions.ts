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
    map.set(c.id, { ...c, personalities: [], zones: [] });
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
  return map;
}

/**
 * subject はその効果を持つキャラ。パーティにいなければ guest（候補）として前衛に加えた前提で数える。
 * 本人の位置の条件は、候補なら置き場所を選べるので満たせる扱い、両隣は並び次第なので unknown。
 */
export function evaluateCondition(clauses: Clause[], text: string, subjectId: number, members: CondMember[], guest?: Guest): CondResult {
  const member = members.find((m) => m.id === subjectId);
  const subject: CondMember | null = member ?? (guest ? { ...guest, slot: "main", position: -1 } : null);
  const ctx: Ctx = { subject, isGuest: !member, all: !member && subject ? [...members, subject] : members };
  const states = clauses.map((c) => judge(c, ctx));
  if (states.includes("unmet")) return { state: "unmet", note: `条件未達: ${text}` };
  if (states.every((s) => s === "met")) return { state: "met", note: `条件OK: ${text}` };
  return { state: "unknown", note: `条件: ${text}` };
}

type Ctx = { subject: CondMember | null; isGuest: boolean; all: CondMember[] };
const ok = (b: boolean): CondState => (b ? "met" : "unmet");
const elementOf = (m: CondMember) => m.personalities.find((p) => (ELEMENTS as readonly string[]).includes(p)) ?? "";

function matches(m: CondMember, who: Who): boolean {
  if ("personalities" in who) return who.personalities.some((p) => m.personalities.includes(p));
  if ("ls" in who) return m.ls_type === who.ls;
  if ("gender" in who) return m.gender === who.gender;
  return who.weapons.includes(m.weapon);
}

function judge(c: Clause, { subject, isGuest, all }: Ctx): CondState {
  if ("battle" in c || "unclassified" in c) return "unknown";
  if ("anyOf" in c) {
    const alts = c.anyOf.map((alt) => alt.map((x) => judge(x, { subject, isGuest, all })));
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
    return ok(all.some((m) => m.zones.some((z) => {
      const zm = z.match(ZONE_TYPE);
      return !!zm && names.includes(zm[2]!) && (!tier || zm[1] === tier);
    })));
  }
  if ("anyZone" in c) return ok(all.some((m) => m.zones.length > 0));
  if ("frontElements" in c) {
    const { distinct, min, excludeSelf } = c.frontElements;
    const els = all.filter((m) => m.slot === "main" && !(excludeSelf && m.id === subject?.id)).map(elementOf);
    if (distinct) return ok(new Set(els).size === els.length);
    return ok(new Set(els.filter(Boolean)).size >= (min ?? 0));
  }
  return "unknown"; // anaden-mcp が知らない形を足しても、判定できないだけで壊れない
}
