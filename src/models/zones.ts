// ZONE（陣）は戦場に1つしか張れない。パーティで張れる ZONE のうち1つを「張る ZONE」に決め、
// 「〜陣展開時」の効果と ZONE の枠はそれだけで判定する。開幕（前衛で戦闘開始時）に別の陣を張ってしまうメンバーは衝突として扱う。
import type { Db } from "../db.ts";
import { type Clause, type CondMember, evaluateCondition } from "./conditions.ts";
import { zoneRate } from "./estimate.ts";

export type Zone = { type: string; name: string; tier: string };
export type ZoneOption = Zone & { by: number[]; opening: boolean; rate: number };
export type ZonePlan = {
  /** 張る ZONE（張れるものがなければ null） */
  active: ZoneOption | null;
  /** パーティで張れる ZONE（陣ごと。同じ陣は極を優先） */
  options: ZoneOption[];
  /** 開幕に張る ZONE が active と違うメンバー（開幕に別の陣を上書きする・張り直しに手番を使う） */
  conflicts: { characterId: number; zone: Zone }[];
};

const ZONE_TYPE = /^(極・|絶・)?(.+陣(・.+)?)展開$/;
export function parseZone(type: string): Zone | null {
  const m = type.match(ZONE_TYPE);
  return m ? { type, name: m[2]!, tier: m[1] ?? "" } : null;
}

/**
 * 前衛のメンバーが張れる ZONE を集め、張る ZONE を決める。後衛は行動せず、VC は使わない前提なので数えない。
 * prefer があればその陣を張る（自動編成で ZONE ごとに試すため）。なければ★の属性・攻撃種を一番伸ばす陣、同じなら開幕に張られる陣
 */
export function planZone(db: Db, members: CondMember[], element: string, kind: string, prefer?: string): ZonePlan {
  const front = members.filter((m) => m.slot === "main");
  if (front.length === 0) return { active: null, options: [], conflicts: [] };
  const params = Object.fromEntries(front.map((m, i) => [`i${i}`, m.id]));
  const rows = db
    .query<{ character_id: number; type: string; conditions: string; condition_clauses: string }, any>(
      `SELECT character_id, type, conditions, condition_clauses FROM character_effects
       WHERE character_id IN (${front.map((_, i) => `$i${i}`).join(", ")}) AND type LIKE '%陣%展開' AND source NOT LIKE 'VC Lv%'`,
    )
    .all(params);
  const options = new Map<string, ZoneOption>();
  const openings: { characterId: number; zone: Zone }[] = [];
  for (const r of rows) {
    const zone = parseZone(r.type);
    if (!zone) continue;
    const clauses = JSON.parse(r.condition_clauses || "[]") as Clause[];
    // 張る条件を満たさない（例: 前衛の<晶>が足りない）なら張れない。戦闘の流れ次第の条件は張れる扱い
    if (clauses.length && evaluateCondition(clauses, r.conditions, r.character_id, members).state === "unmet") continue;
    const opening = r.conditions.includes("戦闘開始時");
    if (opening) openings.push({ characterId: r.character_id, zone });
    const rate = zoneRate(zone.type, element, kind);
    const cur = options.get(zone.name);
    if (!cur) options.set(zone.name, { ...zone, by: [r.character_id], opening, rate });
    else {
      if (!cur.by.includes(r.character_id)) cur.by.push(r.character_id);
      cur.opening ||= opening;
      // 同じ陣なら倍率の高い方（極）を張る
      if (rate > cur.rate || (rate === cur.rate && zone.tier && !cur.tier)) Object.assign(cur, { type: zone.type, tier: zone.tier, rate });
    }
  }
  const list = [...options.values()].sort((a, b) => b.rate - a.rate || Number(b.opening) - Number(a.opening));
  const active = (prefer ? list.find((o) => o.name === prefer) : undefined) ?? list[0] ?? null;
  return { active, options: list, conflicts: openings.filter((o) => o.zone.name !== active?.name) };
}
