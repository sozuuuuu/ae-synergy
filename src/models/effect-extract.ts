// 取り込み元の1キャラ分のデータから、効果を「種別1つ = 1行」に分解する。

export type Scope = "self" | "party" | "ally" | "conditional" | "enemy" | "other";

export type ExtractedEffect = {
  type: string;
  scope: Scope;
  targets: string;
  value: number | null;
  turns: number | null;
  element: string | null;
  conditions: string;
  personalities: string;
  description: string;
  source: string;
};

// 区分（取り込み元のキー => 出典の見出し）。skills と valorChant は個別に出典を付ける
export const SECTION_SOURCES: Record<string, string> = {
  abilities: "アビリティ", uniqueAbility: "固有アビリティ", lsAbility: "天冥アビリティ", sbEnhance: "SB強化",
  stack: "蓄積", modeChange: "モードチェンジ", specialState: "特殊状態", sing: "歌唱", singActivate: "歌唱発動",
  counter: "カウンター", link: "リンク", linkAbility: "リンクアビリティ", chainAbility: "チェインアビリティ",
  zoneAbility: "ZONEアビリティ", prayer: "祈り", prayerActivate: "祈り発動", resonance: "共鳴",
  resonanceSkill: "共鳴スキル", anotherSense: "アナザーセンス", exSpecialMove: "EX必殺技",
};

/** targets の表記を、誰に効くかの大まかな区分にまとめる */
export function scopeOf(targets: string): Scope {
  const parts = targets.split(/[,、]/).map((t) => t.trim()).filter(Boolean);
  if (parts.length === 0) return "other";
  const scopes = parts.map((t): Scope => {
    if (t === "自身") return "self";
    if (/^(味方全体|味方|味方前衛後衛全体|自身を除く味方全体|自身を除く味方前衛後衛全体|敵味方全体|自身を除く敵味方全体|敵味方)$/.test(t)) return "party";
    if (/パーソナリティ|天の味方|冥の味方|男性の味方|女性の味方|蓄積を持つ味方|自身を除く冥の味方|自身を除く天の味方/.test(t)) return "conditional";
    if (/味方/.test(t)) return "ally"; // 味方単体・左右枠・両隣・後衛など位置や選択次第
    if (/敵|攻撃対象/.test(t)) return "enemy";
    return "other";
  });
  // 複数あるときは一番広いものを採る
  for (const s of ["party", "conditional", "ally", "enemy", "self"] as const) if (scopes.includes(s)) return s;
  return "other";
}

/**
 * 取り込み元の conditions が空でも、説明文の頭に「〜場合、」「〜時、」で条件が書かれていることがある。
 * 後ろの「※」注記は除き、最後の「場合、」「時、」までを条件とみなす
 */
export function conditionInDescription(description: string): string {
  const body = description.split("※")[0]!;
  const m = body.match(/^(.*(?:場合|時))、/);
  const cond = m?.[1]!.trim() ?? "";
  return /(この|その)時$/.test(cond) ? "" : cond; // 「この時、」は直前の文を指すだけ
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const text = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

export function extractEffects(row: Record<string, any>): ExtractedEffect[] {
  const out: ExtractedEffect[] = [];

  const walk = (node: unknown, source: string, inherited: { conditions: string; targets: string }) => {
    if (Array.isArray(node)) {
      node.forEach((child) => walk(child, source, inherited));
      return;
    }
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, any>;
    // 蓄積の効果は、その蓄積が溜まっている間だけ。溜まり方は cond[].stack に書かれている
    const stacking = Array.isArray(n.cond) ? n.cond.flatMap((c: any) => [c?.stack].flat().map(text)).filter(Boolean) : [];
    const stackCondition = stacking.length ? `${text(n.name) || "蓄積"}蓄積時（${stacking.join("／")}）` : "";
    const own = text(n.conditions) || stackCondition || conditionInDescription(text(n.description));
    const conditions = inherited.conditions.includes(own) ? inherited.conditions : [inherited.conditions, own].filter(Boolean).join(" / ");
    const targets = text(n.targets) || inherited.targets;

    for (const type of [n.types].flat()) {
      if (typeof type !== "string" || !type) continue;
      out.push({
        type,
        scope: scopeOf(targets),
        targets,
        value: num(n.value),
        turns: num(n.turn),
        element: typeof n.element === "string" ? n.element : null,
        conditions,
        personalities: Array.isArray(n.personalities) ? n.personalities.join("、") : "",
        description: text(n.description),
        source,
      });
    }
    for (const [key, child] of Object.entries(n)) {
      if (key === "personalities" || !child || typeof child !== "object") continue;
      walk(child, source, { conditions, targets });
    }
  };

  const none = { conditions: "", targets: "" };
  for (const skill of Array.isArray(row.skills) ? row.skills : []) {
    walk(skill?.effects, text(skill?.name) || "スキル", none);
  }
  for (const vc of Array.isArray(row.valorChant) ? row.valorChant : []) {
    walk(vc?.effects, `VC Lv${vc?.level ?? "?"}`, none);
  }
  // アビリティ・固有アビリティは対象の記載がなければ本人への常時効果
  const selfByDefault = new Set(["abilities", "uniqueAbility"]);
  for (const [key, label] of Object.entries(SECTION_SOURCES)) {
    if (!row[key]) continue;
    if (key in WHILE_ACTIVE && Array.isArray(row[key])) {
      for (const entry of row[key]) walk(entry, label, { conditions: WHILE_ACTIVE[key]!(entry), targets: "" });
      continue;
    }
    walk(row[key], label, selfByDefault.has(key) ? { conditions: "", targets: "自身" } : none);
  }
  return out;
}

/** 歌唱・祈祷・モードチェンジの効果は、その状態の間だけ。項目ごとに「〇〇中」を条件にする */
const WHILE_ACTIVE: Record<string, (entry: any) => string> = {
  sing: (e) => `歌唱「${text(e?.name)}」中`,
  singActivate: (e) => `歌唱「${text(e?.name)}」中の${text(e?.actTiming)}`,
  prayer: (e) => `祈祷「${text(e?.name)}」中`,
  prayerActivate: (e) => [`祈祷「${text(e?.name)}」中の${text(e?.actTiming)}`, e?.ver && e.ver !== "通常時" ? text(e.ver) : ""].filter(Boolean).join("、"),
  modeChange: (e) => {
    const acts = (Array.isArray(e?.modeCond) ? e.modeCond : []).map((c: any) => text(c?.act)).filter(Boolean);
    return `モード「${text(e?.name)}」中${acts.length ? `（${acts.join("／")}）` : ""}`;
  },
};
