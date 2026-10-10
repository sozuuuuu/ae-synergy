// パーティに必要な「枠」と、キャラの効果がその枠を埋めるかの判定ルール。
// 火力は乗算の別枠ごとに1つずつ（埋まっていない枠を埋めるほど伸びる）。仕様の根拠は doc/battle-mechanics.md。
import type { Db } from "../db.ts";
import { WEAPONS } from "./characters.ts";

export type Group = "damage" | "durability" | "boss";
export const GROUP_NAMES: Record<Group, string> = { damage: "火力", durability: "耐久", boss: "ボス対策" };

/** 効果が誰に効く必要があるか */
type To = "enemy" | "attacker" | "party" | "any";

export type Requirement = {
  key: string;
  group: Group;
  label: string;
  hint: string;
  to: To;
  match: (type: string) => boolean;
  /** 一致はするが効きが弱いときの注記（例: 属性と合わない陣）。null なら問題なし */
  caveat?: (type: string) => string | null;
};

export const ATTACK_KINDS = ["斬", "突", "打", "魔法"] as const;
export const ATTACK_ELEMENTS = ["火", "地", "水", "風", "雷", "陰", "晶", "無"] as const;
const ATTACK_TYPES: Record<string, (typeof ATTACK_KINDS)[number]> = { 斬攻撃: "斬", 突攻撃: "突", 打攻撃: "打", 魔法攻撃: "魔法" };

const ZONES: Record<string, string> = {
  火: "烈火", 地: "地裂", 水: "水天", 風: "風王", 雷: "招雷", 陰: "刻陰", 晶: "輝晶",
  斬: "煌斬", 突: "瞬突", 打: "轟打", 魔法: "幻魔",
};

const oneOf = (...types: string[]) => (t: string) => types.includes(t);
/** 敵へのステータスデバフ（固定値版と全ステータスDOWNも含む） */
const statDown = (...stats: string[]) => (t: string) => t === "全ステータスDOWN" || stats.some((s) => t.startsWith(`${s}DOWN`));

/** 陣の種別がこの属性・攻撃種のダメージを上げるか（双撃陣・斬魔なども含む） */
export function zoneFits(type: string, element: string, kind: string): boolean {
  const name = type.replace(/^極・/, "").replace(/展開$/, "");
  if ([element, kind].some((x) => ZONES[x] && name === `${ZONES[x]}陣`)) return true;
  const dual = name.match(/^双撃陣・(.+)$/);
  return !!dual && !!kind && dual[1]!.includes(kind === "魔法" ? "魔" : kind);
}

/** 想定ボスへの必須能力（パーティごとに選ぶ） */
export const BOSS_NEEDS: Requirement[] = [
  { key: "status_immune", group: "boss", label: "状態異常無効", hint: "状態異常を撒くボス向け", to: "party", match: oneOf("状態異常無効") },
  { key: "status_resist", group: "boss", label: "状態異常耐性UP", hint: "", to: "party", match: oneOf("状態異常耐性UP") },
  { key: "knockback", group: "boss", label: "吹き飛ばし無効", hint: "前衛を入れ替えてくるボス向け", to: "party", match: oneOf("吹き飛ばし無効") },
  { key: "dispel", group: "boss", label: "敵のバフ解除", hint: "", to: "enemy", match: oneOf("バフ解除", "バフ/デバフ解除") },
  { key: "buff_reversal", group: "boss", label: "バフリバーサル", hint: "敵のステータス・耐性・攻撃バフをデバフに反転", to: "enemy", match: oneOf("バフリバーサル") },
  { key: "cleanse", group: "boss", label: "味方のデバフ解除", hint: "", to: "party", match: oneOf("デバフ解除", "バフ/デバフ解除") },
  { key: "break", group: "boss", label: "ブレイク", hint: "ブレイク・ウェポン／エレメンタルブレイク", to: "any", match: (t) => /ブレイク/.test(t) && t !== "ブレイク無効" },
  { key: "revive", group: "boss", label: "戦闘不能回復", hint: "", to: "any", match: oneOf("戦闘不能回復") },
  { key: "af", group: "boss", label: "AF支援", hint: "AFゲージ回復・蓄積・コンボ倍率", to: "any", match: (t) => /^AF(ゲージ(回復|蓄積|増加量UP)|コンボ倍率増加)/.test(t) },
];

export type PartyContext = {
  attacker: { id: number; weapon: string; ls_type: string | null; personalities: string[] } | null;
  attackElement: string;
  attackKind: string;
  bossElement: string;
  bossAttack: string; // physical / magic / ""
  bossNeeds: string[];
};

export function requirementsFor(ctx: PartyContext): Requirement[] {
  const reqs: Requirement[] = [];
  const E = ctx.attackElement;
  const K = ctx.attackKind;

  if (ctx.attacker && K) {
    const magic = K === "魔法";
    const weapon = WEAPONS[ctx.attacker.weapon] ?? "";
    reqs.push(
      { key: "type_res_down", group: "damage", label: `${magic ? "魔法" : K}耐性DOWN`, hint: "敵の攻撃種耐性を下げる", to: "enemy",
        match: magic ? oneOf("魔法耐性DOWN") : oneOf(`${K}耐性DOWN`, "物理耐性DOWN") },
    );
    if (E && E !== "無") {
      reqs.push(
        { key: "elem_res_down", group: "damage", label: `${E}属性耐性DOWN`, hint: "敵の属性耐性を下げる", to: "enemy", match: oneOf(`${E}属性耐性DOWN`, "全属性耐性DOWN") },
        { key: "elem_atk_up", group: "damage", label: `${E}属性攻撃UP`, hint: "アタッカーに届く属性攻撃バフ", to: "attacker", match: oneOf(`${E}属性攻撃UP`, "全属性攻撃UP") },
      );
    }
    reqs.push(
      { key: "weapon_up", group: "damage", label: `${weapon}装備者ダメージUP`, hint: "武器種バフ", to: "attacker", match: oneOf(`${weapon}装備者ダメージUP`, "全武器種装備者ダメージUP") },
      { key: "stat_up", group: "damage", label: magic ? "知性UP" : "腕力UP", hint: "ステータスバフ", to: "attacker", match: (t) => t.startsWith(magic ? "知性UP" : "腕力UP") },
      { key: "def_down", group: "damage", label: magic ? "精神DOWN" : "耐久DOWN", hint: magic ? "敵の魔防を下げる" : "敵の防御を下げる", to: "enemy",
        match: statDown(magic ? "精神" : "耐久") },
      // 特殊バフは乗算では同じ枠だが重ねがけでき、精神統一・心技一体が高いほど他も伸びるので分けて埋める
      magic
        ? { key: "concentration", group: "damage", label: "精神統一", hint: "最大MPに応じて魔法ダメージUP", to: "attacker", match: oneOf("精神統一") }
        : { key: "unity", group: "damage", label: "心技一体", hint: "最大MPに応じて物理ダメージUP", to: "attacker", match: oneOf("心技一体") },
      { key: "underdog", group: "damage", label: "下克上", hint: "敵のLvが高いほどダメージUP", to: "attacker", match: oneOf("下克上") },
      { key: "ambush", group: "damage", label: "虎視眈眈", hint: "敵の行動後に動くとダメージUP", to: "attacker", match: oneOf("虎視眈眈") },
      { key: "zone", group: "damage", label: "ZONE", hint: [E, K].map((x) => ZONES[x]).filter(Boolean).map((z) => `${z}陣`).join("・"), to: "any",
        match: (t) => /陣.*展開$/.test(t) && !/^(.*)陣展開時/.test(t),
        caveat: (t) => (zoneFits(t, E, K) ? null : "属性・攻撃種と一致しない陣") },
      { key: "dot", group: "damage", label: "毒・ペイン", hint: "", to: "enemy", match: oneOf("毒", "猛毒", "ペイン") },
      { key: "over_crit", group: "damage", label: magic ? "魔法オーバークリティカル" : "オーバークリティカル", hint: "クリ率100%超の分だけ別枠でダメージ2倍", to: "attacker",
        match: oneOf(magic ? "魔法オーバークリティカル" : "オーバークリティカル") },
      { key: "crit_rate", group: "damage", label: magic ? "魔法クリティカル率UP" : "物理クリティカル率UP", hint: "クリダメ・オーバークリティカルの前提", to: "attacker",
        match: oneOf(magic ? "魔法クリティカル率UP" : "物理クリティカル率UP") },
      { key: "crit_dmg", group: "damage", label: magic ? "魔法クリティカルダメージUP" : "物理クリティカルダメージUP", hint: "単純加算・上限なし", to: "attacker",
        match: oneOf(magic ? "魔法クリティカルダメージUP" : "物理クリティカルダメージUP") },
      { key: "devotion", group: "damage", label: "ルナティック(挺身)", hint: magic ? "精神を魔力に加算" : "耐久を攻撃に加算", to: "attacker",
        match: oneOf("ルナティック(挺身)") },
      // 心眼・捨身はルナティックの乗算枠で、互いにも乗算になる
      { key: "insight", group: "damage", label: "ルナティック(心眼)", hint: "ダメージ1.5倍＋弱点倍率+1", to: "attacker", match: oneOf("ルナティック(心眼)") },
      { key: "abandon", group: "damage", label: "ルナティック(捨身)", hint: "ダメージ1.7倍＋クリ率100%UP（毎行動HP20%自傷）", to: "attacker",
        match: oneOf("ルナティック(捨身)") },
      { key: "weak", group: "damage", label: "弱点時ダメージUP", hint: "弱点を突けるとき", to: "attacker", match: oneOf("弱点時ダメージUP") },
    );
  }

  const physical = ctx.bossAttack === "physical";
  const magical = ctx.bossAttack === "magic";
  reqs.push(
    { key: "heal", group: "durability", label: "全体回復", hint: "", to: "party", match: (t) => /^HP(回復|治癒)/.test(t) },
    { key: "barrier", group: "durability", label: "バリア・シールド", hint: "", to: "party",
      match: (t) => /^(バリア|シールド)/.test(t) && !["バリア貫通", "バリア効果量増加"].includes(t) },
    { key: "res_up", group: "durability", label: physical ? "物理耐性UP" : magical ? "魔法耐性UP" : "物理・魔法耐性UP", hint: "", to: "party",
      match: physical ? oneOf("物理耐性UP") : magical ? oneOf("魔法耐性UP") : oneOf("物理耐性UP", "魔法耐性UP") },
    // 敵の腕力・知性は攻撃値A・Bの両方に入るので、味方への耐性バフよりよく効く
    { key: "enemy_atk_down", group: "durability", label: physical ? "腕力DOWN" : magical ? "知性DOWN" : "腕力・知性DOWN", hint: "敵の攻撃力を下げる", to: "enemy",
      match: statDown(...(physical ? ["腕力"] : magical ? ["知性"] : ["腕力", "知性"])) },
    { key: "enemy_spd_down", group: "durability", label: "速度DOWN", hint: "敵より先に動ける（虎視眈眈とは逆）", to: "enemy", match: statDown("速度") },
  );
  if (ctx.bossElement && ctx.bossElement !== "無") {
    reqs.push({ key: "elem_res_up", group: "durability", label: `${ctx.bossElement}属性耐性UP`, hint: "ボスの攻撃属性への耐性", to: "party",
      match: oneOf(`${ctx.bossElement}属性耐性UP`, "全属性耐性UP") });
  }
  reqs.push(
    { key: "endure", group: "durability", label: "踏ん張る", hint: "致死ダメージをHP1で耐える", to: "party", match: oneOf("踏ん張る") },
    { key: "tank", group: "durability", label: "挑発・庇い", hint: "挑発・庇立て・守護", to: "any", match: oneOf("挑発", "庇立て", "守護") },
    { key: "cure", group: "durability", label: "状態異常回復", hint: "", to: "party", match: oneOf("状態異常回復") },
    { key: "mp", group: "durability", label: "MP回復", hint: "", to: "party", match: (t) => /^MP(回復|治癒)/.test(t) },
  );

  for (const key of ctx.bossNeeds) {
    const need = BOSS_NEEDS.find((n) => n.key === key);
    if (need) reqs.push(need);
  }
  return reqs;
}

export type EffectRow = {
  character_id: number;
  type: string;
  scope: string;
  targets: string;
  value: number | null;
  turns: number | null;
  conditions: string;
  personalities: string;
  description: string;
  source: string;
};

/** full: そのまま効く / partial: 位置・条件次第や本人のみ / null: 効かない */
export type Fit = { level: "full" | "partial"; note: string };

export function fitOf(req: Requirement, e: EffectRow, ctx: PartyContext): Fit | null {
  if (!req.match(e.type)) return null;
  const isAttacker = ctx.attacker?.id === e.character_id;
  const condition = e.conditions ? `条件: ${e.conditions}` : "";
  const caveat = req.caveat?.(e.type) ?? "";
  const result = (level: Fit["level"], note = ""): Fit => ({
    level: level === "full" && (e.conditions || caveat) ? "partial" : level,
    note: [caveat, note, condition].filter(Boolean).join(" / "),
  });

  switch (req.to) {
    case "enemy":
      return e.scope === "enemy" ? result(e.targets.includes("単体") ? "partial" : "full", e.targets.includes("単体") ? "単体" : "") : null;
    case "any":
      return result("full");
    case "attacker":
      if (isAttacker && e.scope !== "enemy") return result("full");
      if (e.scope === "party") return result("full");
      if (e.scope === "ally") return result("partial", `対象: ${e.targets}`);
      if (e.scope === "conditional") return conditionalFit(e, ctx) ? result("full", `対象: ${e.targets}`) : null;
      return null;
    case "party":
      if (e.scope === "party") return result("full");
      if (e.scope === "self") return result("partial", "本人のみ");
      if (e.scope === "ally" || e.scope === "conditional") return result("partial", `対象: ${e.targets}`);
      return null;
  }
}

/** 「天の味方」「特定パーソナリティの味方」などがアタッカーに当たるか */
function conditionalFit(e: EffectRow, ctx: PartyContext): boolean {
  const a = ctx.attacker;
  if (!a) return false;
  if (e.targets.includes("天の味方") && a.ls_type !== "天") return false;
  if (e.targets.includes("冥の味方") && a.ls_type !== "冥") return false;
  const required = e.personalities.split("、").filter(Boolean);
  const inline = [...e.targets.matchAll(/<([^>]+)>/g)].map((m) => m[1]!);
  const names = [...required, ...inline];
  return names.length === 0 || names.some((n) => a.personalities.includes(n));
}

/** アタッカーの攻撃スキルで一番多い属性・攻撃種を既定値にする */
export function defaultAttack(db: Db, characterId: number): { element: string; kind: string } {
  const row = db
    .query<{ type: string; element: string | null; n: number }, any>(
      `SELECT type, element, COUNT(*) AS n FROM character_effects
       WHERE character_id = $id AND type IN ('斬攻撃', '突攻撃', '打攻撃', '魔法攻撃')
       GROUP BY type, element ORDER BY n DESC LIMIT 1`,
    )
    .get({ id: characterId });
  if (!row) return { element: "", kind: "" };
  const element = row.element && (ATTACK_ELEMENTS as readonly string[]).includes(row.element) ? row.element : "無";
  return { element, kind: ATTACK_TYPES[row.type] ?? "" };
}

let typeCache: string[] | null = null;
export function allEffectTypes(db: Db): string[] {
  typeCache ??= db.query<{ type: string }, []>("SELECT DISTINCT type FROM character_effects").all().map((r) => r.type);
  return typeCache;
}
export function clearEffectTypeCache() {
  typeCache = null;
}

export function effectsForCharacters(db: Db, characterIds: number[], types: string[]): EffectRow[] {
  if (characterIds.length === 0 || types.length === 0) return [];
  const params: Record<string, string | number> = {};
  characterIds.forEach((id, i) => (params[`c${i}`] = id));
  types.forEach((t, i) => (params[`t${i}`] = t));
  return db
    .query<EffectRow, any>(
      `SELECT character_id, type, scope, targets, value, turns, conditions, personalities, description, source FROM character_effects
       WHERE character_id IN (${characterIds.map((_, i) => `$c${i}`).join(", ")}) AND type IN (${types.map((_, i) => `$t${i}`).join(", ")})`,
    )
    .all(params);
}

export type Provider = { characterId: number; fit: Fit; effect: EffectRow };
export type Coverage = { req: Requirement; status: "ok" | "partial" | "missing"; providers: Provider[] };

const better = (a: Provider, b: Provider) =>
  (a.fit.level === "full" ? 1 : 0) - (b.fit.level === "full" ? 1 : 0) || (a.effect.value ?? 0) - (b.effect.value ?? 0);

/** 各枠を誰がどう埋めているか。キャラごとに一番良い効果だけを残す */
export function evaluateCoverage(db: Db, ctx: PartyContext, memberIds: number[]): Coverage[] {
  const reqs = requirementsFor(ctx);
  const types = allEffectTypes(db).filter((t) => reqs.some((r) => r.match(t)));
  const effects = effectsForCharacters(db, memberIds, types);
  return reqs.map((req) => {
    const best = new Map<number, Provider>();
    for (const effect of effects) {
      const fit = fitOf(req, effect, ctx);
      if (!fit) continue;
      const p = { characterId: effect.character_id, fit, effect };
      const current = best.get(effect.character_id);
      if (!current || better(p, current) > 0) best.set(effect.character_id, p);
    }
    const providers = [...best.values()].sort((a, b) => better(b, a));
    const status = providers.some((p) => p.fit.level === "full") ? "ok" : providers.length ? "partial" : "missing";
    return { req, status, providers };
  });
}

/** 枠を埋められるキャラの候補（メンバー以外）。そのまま効くもの・効果量の大きいものから */
export function candidatesFor(db: Db, ctx: PartyContext, req: Requirement, excludeIds: number[], limit = 30): Provider[] {
  const types = allEffectTypes(db).filter((t) => req.match(t));
  if (types.length === 0) return [];
  const params: Record<string, string | number> = {};
  types.forEach((t, i) => (params[`t${i}`] = t));
  const rows = db
    .query<EffectRow, any>(
      `SELECT character_id, type, scope, targets, value, turns, conditions, personalities, description, source FROM character_effects
       WHERE type IN (${types.map((_, i) => `$t${i}`).join(", ")})`,
    )
    .all(params);
  const exclude = new Set(excludeIds);
  // 候補はまだアタッカーではないので、アタッカー本人の自己バフ扱いにはしない
  const best = new Map<number, Provider>();
  for (const effect of rows) {
    if (exclude.has(effect.character_id)) continue;
    const fit = fitOf(req, effect, ctx);
    if (!fit) continue;
    const p = { characterId: effect.character_id, fit, effect };
    const current = best.get(effect.character_id);
    if (!current || better(p, current) > 0) best.set(effect.character_id, p);
  }
  return [...best.values()].sort((a, b) => better(b, a)).slice(0, limit);
}

/** 候補を入れたときに、ほかの「まだ完全には埋まっていない枠」のうちどれが埋まるか */
export function extraFills(db: Db, ctx: PartyContext, coverage: Coverage[], candidateIds: number[], exceptKey: string): Map<number, string[]> {
  const open = coverage.filter((c) => c.status !== "ok" && c.req.key !== exceptKey).map((c) => c.req);
  const types = allEffectTypes(db).filter((t) => open.some((r) => r.match(t)));
  const fills = new Map<number, Set<string>>();
  for (const effect of effectsForCharacters(db, candidateIds, types)) {
    for (const req of open) {
      if (fitOf(req, effect, ctx)?.level !== "full") continue;
      if (!fills.has(effect.character_id)) fills.set(effect.character_id, new Set());
      fills.get(effect.character_id)!.add(req.label);
    }
  }
  return new Map([...fills].map(([id, labels]) => [id, [...labels]]));
}
