// 軸のキャラ（★と、いれば固定メンバー）から、空いている席を自動で埋めてパーティを組む。
// 足す候補は「まだ埋まっていない枠を埋められるキャラ」（candidatesFor）から集め、1人ずつ足しては点の高い編成を数本だけ残す（ビームサーチ）。
// 後衛は行動しない（ふだんはグラスタ持ち）ので、組むのは前衛だけ。後衛はユーザーが好きに置く。
// ★の装備（既定はエルピス武器）で埋まる枠は、装備で簡単に付くのでキャラの評価には使わない（その枠のキャラの効果は数えない）。
// 全部の枠を埋めるのが目的ではない。点は「与ダメの目安の伸び」が主で、耐久・ボス対策は敵に合わせて指定した枠（need）だけを必ず満たす。
// 指定しなかった枠は、火力が同じくらいのときの決め手として少しだけ数える。枠の判定は requirements.ts、火力は estimate.ts をそのまま使う。
import type { Db } from "../db.ts";
import { type CharacterSummary, charactersByIds, unownedIds } from "./characters.ts";
import { type Equipment, isGear } from "./equipment.ts";
import { type Enemy, estimateDealt, type Dealt } from "./estimate.ts";
import { addMember, getParty, type Party, type PartyShape, partyContext, SLOT_COUNTS, type Slot } from "./parties.ts";
import {
  BOSS_NEEDS, type Coverage, candidatesFor, defaultAttack, evaluateCoverage, type Group, type PartyContext, requirementsFor,
} from "./requirements.ts";

/** 与ダメの倍率（log2）にかける重み。2倍になると DMG 点 */
const DMG = 10;
/** 指定した枠（と臨機応変）を満たしたときの点。火力をかなり削ってでも満たす */
const REQUIRED = 20;
/** 指定しなかった枠の点（決め手）。火力の枠は与ダメの目安で数えきれない効果（毒・挺身など）があるので少し重い */
const MINOR: Record<Group, number> = { damage: 0.3, durability: 0.05, boss: 0.05 };
/**
 * 開幕（前衛で戦闘開始時）に、張る ZONE と違う陣を張ってしまうメンバー1人あたりの減点。張り直しは★が開幕に使う先制スキルで済むことが多いので、
 * 火力がほぼ同じときの決め手程度（0.5 点 ≒ 与ダメ 3.5%）
 */
const ZONE_CONFLICT = 0.5;
/** △（条件付き・本人のみなど）は ✓ の何割と見るか */
const PARTIAL = 0.3;

/** need に指定できる枠（耐久とボス対策）。耐久の枠のキーは攻撃や想定ボスで変わらない */
export const NEEDABLE: { key: string; label: string }[] = [
  ...requirementsFor({ attacker: null, attackElement: "", attackKind: "", bossElement: "火", bossAttack: "", bossNeeds: [], members: [] })
    .filter((r) => r.group === "durability")
    .map((r) => ({ key: r.key, label: r.key === "elem_res_up" ? "属性耐性UP（ボスの属性）" : r.label })),
  ...BOSS_NEEDS.map((r) => ({ key: r.key, label: r.label })),
];

export type BuildInput = {
  attackerId: number;
  /** ★のほかに必ず入れるメンバー（slot を省くと前衛優先。position はその席が空いていれば使う） */
  fixed?: { id: number; slot?: Slot; position?: number }[];
  /** ★の席（省くと前衛の先頭） */
  attackerSeat?: { slot: Slot; position: number };
  attackElement?: string;
  attackKind?: string;
  bossElement?: string;
  bossAttack?: string;
  bossNeeds?: string[];
  /** ★の装備（equipment.external_id）。武器は '' ならエルピス、'none' ならなし。防具は '' ならなし */
  weapon?: string;
  armor?: string;
  /** 必ず満たす枠（NEEDABLE のキー）。ボス対策のキーは bossNeeds にも足す */
  need?: string[];
  enemy?: Enemy;
  /** 候補から外すキャラ */
  exclude?: number[];
  /** false なら持っていないキャラも候補にする */
  ownedOnly?: boolean;
  /** 前衛を何人まで組むか（★と固定メンバーを含む。最大4） */
  size?: number;
  /** 各段で残す編成の数と、1つの編成から試す候補の数（大きいほど遅いが良い編成が見つかりやすい） */
  beam?: number;
  breadth?: number;
};

export type Placed = { id: number; slot: Slot; position: number };

export type BuildResult = {
  members: (Placed & { character: CharacterSummary; fixed: boolean; fills: string[] })[];
  attackElement: string;
  attackKind: string;
  coverage: Coverage[];
  dealt: Dealt | null;
  score: number;
  /** 必ず満たすことにした枠のキーと、満たせなかった枠（✓ にならなかったもの） */
  required: string[];
  missing: string[];
  /** ★の装備と、それで埋まった枠（キャラの評価には使わなかった枠） */
  gear: { items: Equipment[]; fills: string[] };
  /** 張る ZONE と、開幕に別の陣を張ってしまうメンバー */
  zone: PartyContext["zone"];
};

type Settings = Omit<PartyShape, "members">;
/** coverage は、装備で埋まる枠の供給元を装備だけにしたもの（キャラの評価用） */
type State = { members: Placed[]; score: number; ctx: PartyContext; coverage: Coverage[]; dealt: Dealt | null; gearKeys: Set<string> };

/** 装備が ✓ で埋めている枠は、供給元を装備だけにする（同じ枠のキャラの効果は火力にも点にも数えない） */
function withoutGearSlots(coverage: Coverage[]): { coverage: Coverage[]; gearKeys: Set<string> } {
  const gearKeys = new Set(coverage.filter((c) => c.providers.some((p) => isGear(p.effect) && p.fit.level === "full")).map((c) => c.req.key));
  return {
    gearKeys,
    coverage: coverage.map((c) => (gearKeys.has(c.req.key) ? { ...c, status: "ok" as const, providers: c.providers.filter((p) => isGear(p.effect)) } : c)),
  };
}

/** NS・AS・ES は同じキャラなので同時には入れられない */
export const personOf = (name: string) => name.replace(/\((AS|ES)\)$/, "");

/** slot の空いている一番前の席。満員なら null */
function freeSeat(members: Placed[], slot: Slot): Placed["position"] | null {
  for (let p = 0; p < SLOT_COUNTS[slot]; p++) if (!members.some((m) => m.slot === slot && m.position === p)) return p;
  return null;
}

export function autoBuild(db: Db, input: BuildInput): BuildResult | null {
  const ids = [input.attackerId, ...(input.fixed ?? []).map((f) => f.id)];
  const chars = charactersByIds(db, ids);
  const attacker = chars.get(input.attackerId);
  if (!attacker) return null;
  const attack = defaultAttack(db, attacker.id);
  const settings: Settings = {
    attacker_id: attacker.id,
    attack_element: input.attackElement || attack.element,
    attack_kind: input.attackKind || attack.kind,
    boss_element: input.bossElement ?? "",
    boss_attack: input.bossAttack ?? "",
    weapon: input.weapon ?? "",
    armor: input.armor ?? "",
    boss_needs: [...new Set([...(input.bossNeeds ?? []), ...(input.need ?? []).filter((k) => BOSS_NEEDS.some((b) => b.key === k))])],
  };
  // 臨機応変がないと攻撃種が合わないので、要るときは必須にする
  const required = new Set([...(input.need ?? []), ...settings.boss_needs, "kind_change"]);
  const size = Math.min(SLOT_COUNTS.main, Math.max(1, input.size ?? SLOT_COUNTS.main));
  const beam = input.beam ?? 3;
  const breadth = input.breadth ?? 30;
  const unowned = new Set([...(input.ownedOnly === false ? [] : unownedIds(db)), ...(input.exclude ?? [])]);
  const summaries = new Map(chars);

  const evaluate = (members: Placed[]): State => {
    for (const id of members.map((m) => m.id).filter((id) => !summaries.has(id))) summaries.set(id, charactersByIds(db, [id]).get(id)!);
    const shape: PartyShape = { ...settings, members: members.map((m) => {
      const c = summaries.get(m.id)!;
      return { ...m, weapon: c.weapon, armor: c.armor, ls_type: c.ls_type };
    }) };
    // ZONE は1つしか張れないので、張れる陣ごとに試して一番点の高いものにする
    const first = partyContext(db, shape);
    const zones = first.zone?.options.map((o) => o.name) ?? [];
    let best: State | null = null;
    for (const ctx of [first, ...zones.slice(1).map((zone) => partyContext(db, shape, { zone }))]) {
      const { coverage, gearKeys } = withoutGearSlots(evaluateCoverage(db, ctx, members.map((m) => m.id)));
      const dealt = estimateDealt(db, ctx, coverage, input.enemy ?? {});
      let score = dealt ? DMG * Math.log2(Math.max(1, dealt.multiplier)) : 0;
      for (const c of coverage) {
        const w = required.has(c.req.key) ? REQUIRED : MINOR[c.req.group];
        score += c.status === "ok" ? w : c.status === "partial" ? w * PARTIAL : 0;
      }
      score -= ZONE_CONFLICT * (ctx.zone?.conflicts.length ?? 0);
      if (!best || score > best.score) best = { members, score, ctx, coverage, dealt, gearKeys };
    }
    return best!;
  };

  // 軸を並べる
  const start: Placed[] = [{ id: attacker.id, ...(input.attackerSeat ?? { slot: "main", position: 0 }) }];
  for (const f of input.fixed ?? []) {
    if (!chars.has(f.id) || start.some((m) => m.id === f.id)) continue;
    const slots: Slot[] = f.slot ? [f.slot] : ["main", "sub"];
    for (const slot of slots) {
      const wanted = f.slot === slot && f.position !== undefined && !start.some((m) => m.slot === slot && m.position === f.position) ? f.position : null;
      const position = wanted ?? freeSeat(start, slot);
      if (position !== null) {
        start.push({ id: f.id, slot, position });
        break;
      }
    }
  }
  const fixedIds = new Set(start.map((m) => m.id));

  let frontier = [evaluate(start)];
  let best = frontier[0]!;
  const front = (s: State) => s.members.filter((m) => m.slot === "main").length;
  while (front(frontier[0]!) < size) {
    const next = new Map<string, State>();
    for (const state of frontier) {
      for (const id of candidatePool(db, state, required, unowned, summaries, breadth)) {
        const position = freeSeat(state.members, "main");
        if (position === null) continue;
        const tried = evaluate([...state.members, { id, slot: "main", position }]);
        const key = tried.members.map((m) => m.id).sort().join(",");
        if ((next.get(key)?.score ?? -Infinity) < tried.score) next.set(key, tried);
      }
    }
    if (next.size === 0) break;
    frontier = [...next.values()].sort((a, b) => b.score - a.score).slice(0, beam);
    // 足しても点が伸びなくなったら、そこで止める
    if (frontier[0]!.score <= best.score + 1e-6) break;
    best = frontier[0]!;
  }

  const fills = new Map<number, string[]>();
  const missing = best.coverage.filter((c) => required.has(c.req.key) && c.status !== "ok").map((c) => c.req.label);
  for (const c of best.coverage) {
    for (const p of c.providers) {
      if (p.fit.level !== "full" || isGear(p.effect)) continue;
      fills.set(p.characterId, [...(fills.get(p.characterId) ?? []), c.req.label]);
    }
  }
  return {
    members: best.members.map((m) => ({ ...m, character: summaries.get(m.id)!, fixed: fixedIds.has(m.id), fills: fills.get(m.id) ?? [] })),
    attackElement: settings.attack_element,
    attackKind: settings.attack_kind,
    coverage: best.coverage,
    dealt: best.dealt,
    score: best.score,
    required: [...required].filter((k) => best.coverage.some((c) => c.req.key === k)),
    missing,
    gear: { items: best.ctx.gear?.items ?? [], fills: best.coverage.filter((c) => best.gearKeys.has(c.req.key)).map((c) => c.req.label) },
    zone: best.ctx.zone,
  };
}

/**
 * この編成に足す候補。火力の枠（埋まっていても重ねれば伸びる）と、まだ満たしていない必須の枠を埋められるキャラを集め、
 * 埋められる枠の重みの合計が大きい順に breadth 人まで（全員を点数計算すると遅いので、ここで絞る）
 */
function candidatePool(db: Db, state: State, required: Set<string>, unowned: Set<number>, summaries: Map<number, CharacterSummary>, breadth: number): number[] {
  const memberIds = state.members.map((m) => m.id);
  const taken = new Set(memberIds.map((id) => personOf(summaries.get(id)!.name)));
  const rank = new Map<number, number>();
  for (const c of state.coverage) {
    const need = required.has(c.req.key) && c.status !== "ok";
    if (state.gearKeys.has(c.req.key) || (!need && c.req.group !== "damage")) continue;
    const weight = need ? 3 : c.status === "ok" ? 0.5 : 1;
    for (const p of candidatesFor(db, state.ctx, c.req, memberIds, 40)) {
      if (unowned.has(p.characterId) || p.fit.level === "unmet" || p.fit.level === "sb" || p.fit.level === "vc") continue;
      const w = p.fit.level === "full" ? 1 : PARTIAL;
      rank.set(p.characterId, (rank.get(p.characterId) ?? 0) + w * weight);
    }
  }
  const ids = [...rank.keys()];
  for (const [id, c] of charactersByIds(db, ids.filter((id) => !summaries.has(id)))) summaries.set(id, c);
  return ids
    .filter((id) => !taken.has(personOf(summaries.get(id)!.name)))
    .sort((a, b) => rank.get(b)! - rank.get(a)!)
    .slice(0, breadth);
}

/** 保存済みのパーティの空いている席を埋める。今のメンバーと席・攻撃・想定ボスの条件はそのまま使う */
export function autofillParty(db: Db, party: Party, options: { need?: string[]; ownedOnly?: boolean } = {}): { added: CharacterSummary[]; error?: string } {
  const attacker = party.members.find((m) => m.id === party.attacker_id);
  if (!attacker) return { added: [], error: "自動で組むには、軸にするメンバーに ★ を付けてください" };
  if (party.members.filter((m) => m.slot === "main").length >= SLOT_COUNTS.main) return { added: [], error: "前衛が埋まっています（後衛は自動では埋めません）" };
  const result = autoBuild(db, {
    attackerId: attacker.id,
    attackerSeat: { slot: attacker.slot, position: attacker.position },
    fixed: party.members.filter((m) => m.id !== attacker.id).map((m) => ({ id: m.id, slot: m.slot, position: m.position })),
    attackElement: party.attack_element, attackKind: party.attack_kind,
    bossElement: party.boss_element, bossAttack: party.boss_attack, bossNeeds: party.boss_needs, enemy: party.enemy,
    weapon: party.weapon, armor: party.armor,
    ...options,
  });
  const added = (result?.members ?? []).filter((m) => !m.fixed);
  for (const m of added) addMember(db, getParty(db, party.id)!, m.id, m.slot);
  return { added: added.map((m) => m.character) };
}
