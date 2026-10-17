// 自動編成の依頼（名前で指定したもの）を解決して組み、結果を文章と JSON にする。CLI（scripts/build-party.ts）と MCP（src/mcp.ts）で共通。
import type { Db } from "../db.ts";
import { autoBuild, type BuildResult, NEEDABLE } from "./autobuild.ts";
import { ARMORS, charactersByIds, searchCharacters, WEAPONS } from "./characters.ts";
import { findEquipment, KIND_NAMES, type Kind } from "./equipment.ts";
import { type Enemy, parseEnemy } from "./estimate.ts";
import { addMember, createParty, getParty, SLOT_NAMES, type Slot, updateSettings } from "./parties.ts";
import { BOSS_NEEDS, GROUP_NAMES } from "./requirements.ts";

export type BuildRequest = {
  /** 軸（★）にするキャラ。ラベル・名前・検索語（1人に絞れるもの） */
  attacker: string;
  /** ★のほかに必ず入れるキャラ（後衛に置くなら「名前:後衛」） */
  with?: string[];
  /** 候補から外すキャラ */
  without?: string[];
  element?: string;
  kind?: string;
  bossElement?: string;
  bossAttack?: string;
  /** 火力のほかに必ず満たす枠（NEEDABLE のキー） */
  need?: string[];
  enemy?: Enemy;
  /** ★の武器の名前（省略でエルピス、"none" でなし）・防具の名前（省略でなし） */
  weapon?: string;
  armor?: string;
  /** 前衛を何人まで組むか（最大4） */
  size?: number;
  /** 持っていないキャラも候補にする */
  all?: boolean;
  /** パーティとして保存する */
  save?: boolean;
};

export class BuildError extends Error {}

/** ラベル → 名前の完全一致 → 検索（1人に絞れたときだけ） */
export function resolveCharacter(db: Db, text: string): number {
  const exact = db.query<{ id: number }, any>("SELECT id FROM characters WHERE label = $t OR name = $t ORDER BY label = $t DESC LIMIT 1").get({ t: text });
  if (exact) return exact.id;
  const found = searchCharacters(db, { q: text }, { perPage: 10 });
  if (found.total === 1) return found.characters[0]!.id;
  throw new BuildError(found.total === 0 ? `キャラが見つかりません: ${text}`
    : `「${text}」に当てはまるキャラが ${found.total} 人います: ${found.characters.map((c) => c.label).join("、")}${found.total > 10 ? " …" : ""}`);
}

/** 装備の名前を、パーティの設定の値（external_id / '' / 'none'）に */
function resolveGear(db: Db, kind: Kind, text: string | undefined, type: string | null): string {
  if (!text) return "";
  if (["none", "なし"].includes(text)) return kind === "weapon" ? "none" : "";
  const item = findEquipment(db, text, kind);
  if (!item) throw new BuildError(`${KIND_NAMES[kind]}が見つかりません: ${text}`);
  if (type && item.type !== type) {
    const names: Record<string, string> = kind === "weapon" ? WEAPONS : ARMORS;
    throw new BuildError(`${item.name} は${names[item.type] ?? item.type}です（★は${names[type] ?? type}）`);
  }
  return item.external_id;
}

export type BuildOutcome = { result: BuildResult; attackerId: number; savedPartyId: number | null; text: string; json: unknown };

export function runBuild(db: Db, req: BuildRequest): BuildOutcome {
  const needs = req.need ?? [];
  const unknown = needs.filter((n) => !NEEDABLE.some((x) => x.key === n));
  if (unknown.length) throw new BuildError(`need に使えないキー: ${unknown.join(", ")}。使えるのは ${NEEDABLE.map((x) => `${x.key}（${x.label}）`).join("、")}`);
  const attackerId = resolveCharacter(db, req.attacker);
  const attacker = charactersByIds(db, [attackerId]).get(attackerId)!;
  const fixed = (req.with ?? []).map((entry) => {
    const [name, where] = entry.split(/[:：]/);
    const slot: Slot | undefined = where === "後衛" || where === "sub" ? "sub" : where === "前衛" || where === "main" ? "main" : undefined;
    return { id: resolveCharacter(db, name!.trim()), slot };
  });
  const enemy = parseEnemy(JSON.stringify(req.enemy ?? {}));
  const weapon = resolveGear(db, "weapon", req.weapon, attacker.weapon);
  const armor = resolveGear(db, "armor", req.armor, attacker.armor);
  const result = autoBuild(db, {
    attackerId, fixed, attackElement: req.element, attackKind: req.kind,
    bossElement: req.bossElement, bossAttack: req.bossAttack, need: needs, enemy, weapon, armor,
    exclude: (req.without ?? []).map((name) => resolveCharacter(db, name)),
    ownedOnly: !req.all, size: req.size || 4,
  });
  if (!result) throw new BuildError("組めませんでした");

  let savedPartyId: number | null = null;
  if (req.save) {
    savedPartyId = createParty(db, attackerId)!;
    updateSettings(db, getParty(db, savedPartyId)!, {
      title: "", memo: `自動編成（火力優先${needs.length ? `・必須: ${needs.join(",")}` : ""}）`,
      attackElement: result.attackElement, attackKind: result.attackKind,
      bossElement: req.bossElement ?? "", bossAttack: req.bossAttack ?? "",
      bossNeeds: needs.filter((n) => BOSS_NEEDS.some((b) => b.key === n)), enemy, weapon, armor,
    });
    for (const m of result.members.filter((m) => m.id !== attackerId)) addMember(db, getParty(db, savedPartyId)!, m.id, m.slot);
  }

  const json = {
    attack: { element: result.attackElement, kind: result.attackKind },
    gear: { items: result.gear.items.map((x) => ({ kind: x.kind, name: x.name })), fills: result.gear.fills },
    zone: result.zone?.active ? {
      active: `${result.zone.active.tier}${result.zone.active.name}`,
      by: result.zone.active.by.map((id) => result.members.find((m) => m.id === id)?.character.label),
      conflicts: result.zone.conflicts.map((c) => ({ member: result.members.find((m) => m.id === c.characterId)?.character.label, zone: `${c.zone.tier}${c.zone.name}` })),
    } : null,
    required: result.required, missing: result.missing,
    members: result.members.map((m) => ({ label: m.character.label, slot: m.slot, position: m.position, fixed: m.fixed, attacker: m.id === attackerId, fills: m.fills })),
    coverage: result.coverage.map((c) => ({ group: c.req.group, label: c.req.label, status: c.status })),
    damage: result.dealt ? { skill: result.dealt.skill.source, multiplier: result.dealt.multiplier, avg: result.dealt.avg, crit: result.dealt.crit } : null,
    savedPartyId,
  };
  return { result, attackerId, savedPartyId, text: formatBuild(result, attackerId, needs, savedPartyId), json };
}

function formatBuild(result: BuildResult, attackerId: number, needs: string[], savedPartyId: number | null): string {
  const lines = [`攻撃: ${[result.attackElement, result.attackKind].filter(Boolean).join("・") || "未設定"} ／ 火力優先${needs.length ? `・必須: ${needs.map((n) => NEEDABLE.find((x) => x.key === n)!.label).join("、")}` : ""}`];
  const gear = result.gear.items.map((x) => `${KIND_NAMES[x.kind]} ${x.name}`).join("・") || "なし";
  const zone = result.zone;
  const nameOf = (id: number) => result.members.find((m) => m.id === id)?.character.label ?? "";
  lines.push(`ZONE: ${zone?.active ? `${zone.active.tier}${zone.active.name}（${zone.active.by.map(nameOf).join("・")}）` : "なし"}`
    + (zone?.conflicts.length ? ` ／ 開幕に別の陣を張る: ${zone.conflicts.map((c) => `${nameOf(c.characterId)}（${c.zone.tier}${c.zone.name}）`).join("、")}` : ""));
  lines.push(`★の装備: ${gear}${result.gear.fills.length ? `（装備で埋まる枠: ${result.gear.fills.join("、")}。この枠はキャラの評価に使っていない）` : ""}`);
  for (const slot of ["main", "sub"] as Slot[]) {
    lines.push("", SLOT_NAMES[slot]);
    const list = result.members.filter((m) => m.slot === slot).sort((a, b) => a.position - b.position);
    if (slot === "sub" && list.length === 0) lines.push("  （空き。グラスタ持ちを好きに置く）");
    for (const m of list) {
      const mark = m.id === attackerId ? "★" : m.fixed ? "◆" : "・";
      lines.push(`  ${mark} ${m.character.label}${m.fills.length ? `  … ${m.fills.join("、")}` : ""}`);
    }
  }
  lines.push("");
  for (const group of Object.keys(GROUP_NAMES) as (keyof typeof GROUP_NAMES)[]) {
    const list = result.coverage.filter((c) => c.req.group === group);
    if (list.length === 0) continue;
    const ok = list.filter((c) => c.status === "ok").length;
    const open = list.filter((c) => c.status !== "ok").map((c) => `${c.req.label}${c.status === "partial" ? "(△)" : ""}`);
    lines.push(`${GROUP_NAMES[group]} ${ok}/${list.length}${open.length ? `  未: ${open.join("、")}` : ""}`);
  }
  if (result.missing.length) lines.push(`満たせなかった必須の枠: ${result.missing.join("、")}`);
  if (result.dealt) lines.push(`与ダメの目安: 支援なしから ×${result.dealt.multiplier.toFixed(2)}（${result.dealt.skill.source}${result.dealt.crit ? "・クリティカル前提" : ""}）`);
  if (savedPartyId) lines.push("", `保存しました: /parties/${savedPartyId}`);
  return lines.join("\n");
}
