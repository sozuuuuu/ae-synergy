// 効果の発動条件のうち、パーティの編成だけで決まるもの（位置・人数・ZONE）を判定する。
// 蓄積・HP・ターン数・敵の状態など戦闘の流れ次第のものは判定せず unknown にする。
import type { Db } from "../db.ts";
import { ELEMENTS, WEAPONS } from "./characters.ts";

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

export type CondState = "met" | "unmet" | "unknown";
export type CondResult = { state: CondState; note: string };

const ZONE_TYPE = /^(極・|絶・)?(.+陣(・.+)?)展開$/;

/** 条件判定に使うキャラの情報（パーソナリティと展開できる ZONE）をまとめて読む */
export function loadCondMembers(db: Db, ids: number[]): Map<number, Omit<CondMember, "slot" | "position">> {
  const map = new Map<number, Omit<CondMember, "slot" | "position">>();
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

type Region = "前衛" | "後衛" | "全体";
const regionOf = (s: string | undefined): Region | null =>
  !s ? null : s === "前衛" ? "前衛" : s === "後衛" ? "後衛" : "全体";
const inRegion = (m: CondMember, r: Region) => r === "全体" || (r === "前衛") === (m.slot === "main");
const WEAPON_CODES = Object.fromEntries(Object.entries(WEAPONS).map(([code, name]) => [name, code]));
const names = (s: string) => [...s.matchAll(/[<「]([^>」]+)[>」]/g)].map((m) => m[1]!);

/**
 * subject はその効果を持つキャラ。パーティにいなければ guest（候補）として前衛に加えた前提で数える。
 * 位置の条件は、候補なら置き場所を選べるので満たせる扱い、両隣は並び次第なので unknown。
 */
export function evaluateCondition(text: string, subjectId: number, members: CondMember[], guest?: Omit<CondMember, "slot" | "position">): CondResult {
  const member = members.find((m) => m.id === subjectId);
  const isGuest = !member;
  const subject: CondMember | null = member ?? (guest ? { ...guest, slot: "main", position: -1 } : null);
  const all = isGuest && subject ? [...members, subject] : members;
  const zones = all.flatMap((m) => m.zones);

  const states: CondState[] = [];
  const unmet: string[] = [];
  for (const clause of text.split(/ \/ |、/).map((c) => c.trim()).filter(Boolean)) {
    const s = evaluateClause(clause, subject, isGuest, all, zones);
    states.push(s);
    if (s === "unmet") unmet.push(clause);
  }
  if (unmet.length) return { state: "unmet", note: `条件未達: ${unmet.join("、")}` };
  if (states.every((s) => s === "met")) return { state: "met", note: `条件OK: ${text}` };
  return { state: "unknown", note: `条件: ${text}` };
}

function evaluateClause(clause: string, subject: CondMember | null, isGuest: boolean, all: CondMember[], zones: string[]): CondState {
  let rest = clause;
  const found: CondState[] = [];
  const take = (re: RegExp, judge: (m: RegExpMatchArray) => CondState) => {
    rest = rest.replace(re, (...args) => {
      const m = args.slice(0, -2) as unknown as RegExpMatchArray;
      found.push(judge(m));
      return " ";
    });
  };
  const count = (region: Region, pred: (m: CondMember) => boolean) => all.filter((m) => inRegion(m, region) && pred(m)).length;
  const compare = (n: number, need: number, op: string | undefined) => (op === "以下" ? n <= need : n >= need) ? "met" : "unmet";

  // 両隣に<X>の味方がいる
  take(/(?:自身の)?(?:前衛)?両隣に((?:<[^>]+>)+)パーソナリティの味方がいる/g, (m) => {
    if (!subject || isGuest) return "unknown";
    if (subject.slot !== "main") return "unmet";
    const want = names(m[1]!);
    const side = (d: number) => all.find((x) => x.slot === "main" && x.position === subject.position + d);
    return [side(-1), side(1)].every((x) => x && want.some((w) => x.personalities.includes(w))) ? "met" : "unmet";
  });

  // 前衛の属性パーソナリティの種類（重複なし / N種類以上）
  const elementsIn = (pred: (m: CondMember) => boolean) =>
    all.filter((m) => m.slot === "main" && pred(m)).map((m) => m.personalities.find((p) => (ELEMENTS as readonly string[]).includes(p)) ?? "");
  take(/前衛の味方全員の属性パーソナリティが重複していない/g, () => {
    const els = elementsIn(() => true);
    return new Set(els).size === els.length ? "met" : "unmet";
  });
  take(/(自身を除く)?前衛の属性パーソナリティが(\d)種類以上/g, (m) =>
    new Set(elementsIn((x) => !m[1] || x.id !== subject?.id).filter(Boolean)).size >= Number(m[2]) ? "met" : "unmet");

  // 人数（パーソナリティ・天冥・性別・武器）。「がいる」は1人以上、「または」は OR、地域の省略は直前のものを引き継ぐ
  let region: Region = "前衛";
  const counts: CondState[] = [];
  rest = rest.replace(
    /(味方前衛後衛|前衛後衛|前衛|後衛)?(?:の|に)?(?:(天|冥)の|(男性|女性)の|((?:<[^>]+>|「[^」]+」)+)(?:パーソナリティ)?の)味方(?:が?(\d)人(以上|以下)?|がいる)|(味方前衛後衛|前衛後衛|前衛|後衛)?(?:の|に)?([杖剣刀斧槍弓拳槌・]+)装備者(\d)人(以上|以下)?/g,
    (_all, r1, ls, gender, pers, n1, op1, r2, weapons, n2, op2) => {
      region = regionOf(r1 ?? r2) ?? region;
      if (weapons) {
        const codes = String(weapons).split("・").map((w) => WEAPON_CODES[w]).filter(Boolean);
        counts.push(compare(count(region, (m) => codes.includes(m.weapon)), Number(n2), op2));
      } else {
        n1 ??= "1";
        const pred = ls ? (m: CondMember) => m.ls_type === ls
          : gender ? (m: CondMember) => m.gender === gender
          : (m: CondMember) => names(pers).some((p) => m.personalities.includes(p));
        counts.push(compare(count(region, pred), Number(n1), op1));
      }
      return " ";
    },
  );
  if (counts.length) found.push(/または/.test(clause) ? (counts.includes("met") ? "met" : "unmet") : counts.includes("unmet") ? "unmet" : "met");
  rest = rest.replace(/または/g, " ");

  // 本人の位置（「アルテナが前衛で」「自身が前衛にいる」のような本人の名前つきも含む）
  take(/(?:[^\s、/]{1,8}が)?(前衛|後衛)(?:での?|にいる)/g, (m) => {
    if (!subject) return "unknown";
    if (isGuest) return "met";
    return (subject.slot === "main") === (m[1] === "前衛") ? "met" : "unmet";
  });

  // ZONE（特定の陣、または何かの ZONE）。絶ZONE・ANOTHER ZONE・非ZONE は戦闘の流れ次第なので触らない
  // 「水天陣/轟打陣展開時」のように / で並ぶものはどれか1つでよい
  const ZONE_NAME = String.raw`(?:極・|絶・)?(?:双撃陣・[^\s、/]+?|[^\s、/・]+?陣)`;
  take(new RegExp(String.raw`(${ZONE_NAME}(?:\/${ZONE_NAME})*)展開時`, "g"), (m) =>
    m[1]!.split("/").some((name) => {
      const [, prefix = "", base] = name.match(/^(極・|絶・)?(.+)$/)!;
      return zones.some((z) => { const zm = z.match(ZONE_TYPE); return !!zm && zm[2] === base && (!prefix || zm[1] === prefix); });
    }) ? "met" : "unmet");
  take(/(?<![非絶A-Za-z ])(?:属性\/攻撃種別|属性|攻撃種別)?ZONE展開時/g, () => (zones.length ? "met" : "unmet"));

  // 毎ターン来るタイミングや助詞だけが残っていれば、判定済みの部分だけで決まる
  const leftover = rest.replace(/戦闘開始時|ターン開始時|ターン終了時|の時|時|場合|自身|[のにがで\s]/g, "");
  if (leftover) found.push("unknown");
  if (found.length === 0) return "unknown";
  return found.includes("unmet") ? "unmet" : found.includes("unknown") ? "unknown" : "met";
}
