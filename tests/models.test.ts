import { describe, expect, test } from "bun:test";
import { importCharacters, kanaSortKey, loadAnadenData } from "../src/models/character-import.ts";
import { searchCharacters } from "../src/models/characters.ts";
import { addMember, createParty, getParty, moveMember, partyContext, removeMember, setAttacker, updateSettings } from "../src/models/parties.ts";
import { type Clause, evaluateCondition } from "../src/models/conditions.ts";
import { extractEffects } from "../src/models/effect-extract.ts";
import { ENEMY_FIELDS, enemyFromForm, estimateDealt, estimateTaken, parseEnemy, withDefaults } from "../src/models/estimate.ts";
import { candidatesFor, evaluateCoverage, requirementsFor } from "../src/models/requirements.ts";
import { idOf, ROWS, testDb } from "./fixtures.ts";

describe("取り込み", () => {
  test("同名キャラはクラス名でラベルを分け、再取り込みは変更なしになる", () => {
    const db = testDb();
    expect(idOf(db, "同名〈甲〉")).toBeGreaterThan(0);
    expect(idOf(db, "同名〈乙〉")).toBeGreaterThan(0);
    expect(importCharacters(db, ROWS)).toEqual({ created: 0, updated: 0, unchanged: ROWS.length, total: ROWS.length });
  });

  test("取り込み元から消えたキャラは、パーティで使われていなければ削除される", () => {
    const db = testDb();
    importCharacters(db, ROWS.filter((r) => r._id !== "z1"));
    expect(db.query("SELECT 1 FROM characters WHERE external_id = 'z1'").get()).toBeNull();
  });

  test("anaden-mcp の補強済みデータだけを受け付ける", async () => {
    const write = async (data: unknown) => {
      const path = `${import.meta.dir}/../storage/test-anaden-${crypto.randomUUID()}.json`;
      await Bun.write(path, JSON.stringify(data));
      return path;
    };
    const ok = await write({ format: "anaden-mcp/characters", version: 1, generatedAt: "", characters: ROWS });
    expect(await loadAnadenData(ok)).toHaveLength(ROWS.length);
    // anaden-gear の生データ（ただの配列）は拒否する
    await expect(loadAnadenData(await write(ROWS))).rejects.toThrow("補強済みデータ");
    await expect(loadAnadenData("storage/does-not-exist.json")).rejects.toThrow("anaden export");
    for (const f of new Bun.Glob("test-anaden-*.json").scanSync(`${import.meta.dir}/../storage`)) await Bun.file(`${import.meta.dir}/../storage/${f}`).delete();
  });
});

describe("並び順", () => {
  test("五十音順のキーは漢字名なら読みを使い、カタカナ・長音・括弧をならす", () => {
    expect(kanaSortKey("ヴェルダンタ")).toBe("うぇるだんた");
    expect(kanaSortKey("ハーディー(AS)")).toBe("はあでぃい");
    expect(kanaSortKey("月華の令嬢(AS)", "げっかのれいじょう(AS)")).toBe("げっかのれいじょう");
    const keys = ["ねここ", "アルド", "月華の令嬢", "エイミ"].map((n) => kanaSortKey(n, n === "月華の令嬢" ? "げっかのれいじょう" : null)).sort();
    expect(keys).toEqual(["あるど", "えいみ", "げっかのれいじょう", "ねここ"]);
  });
});

describe("効果の分解", () => {
  test("発動条件は anaden-mcp が付けた _condition の条件文と構造化した条件をそのまま使う", () => {
    const clauses: Clause[] = [{ slot: "main" }, { neighbors: { personalities: ["陰"] } }];
    const [effect, plain] = extractEffects({
      uniqueAbility: [{ effects: [
        { description: "前衛でターン開始時、…", types: "ルナティック(捨身)", targets: "自身", _condition: { text: "前衛でターン開始時、両隣に<陰>", clauses } },
        { description: "腕力+10%", types: "腕力UP", value: 10 },
      ] }],
    });
    expect(effect!.conditions).toBe("前衛でターン開始時、両隣に<陰>");
    expect(JSON.parse(effect!.condition_clauses)).toEqual(clauses);
    expect([plain!.conditions, plain!.condition_clauses]).toEqual(["", "[]"]);
  });
});

describe("キャラ検索", () => {
  test("ひらがなの名前と効果キーワード（AND）で絞れる", () => {
    const db = testDb();
    expect(searchCharacters(db, { q: "てすと 支援" }).characters.map((c) => c.label)).toEqual(["テスト支援"]);
    const result = searchCharacters(db, { effect: "火属性 耐性down" });
    expect(result.characters.map((c) => c.label)).toEqual(["テスト支援"]);
    expect(result.characters[0]!.matches).toEqual(["敵全体に火属性耐性50%DOWN(3ターン)"]);
  });

  test("属性はパーソナリティで絞れる", () => {
    const db = testDb();
    expect(searchCharacters(db, { element: ["火"] }).characters.map((c) => c.label).sort()).toEqual(["テストアタッカー", "テスト陣"]);
  });

  test("属性・武器・スタイルは複数選ぶとどれか（OR）、パーソナリティはすべて（AND）", () => {
    const db = testDb();
    const labels = (f: Parameters<typeof searchCharacters>[1]) => searchCharacters(db, f).characters.map((c) => c.label).sort();
    expect(labels({ element: ["火", "水"] })).toEqual(["テストアタッカー", "テスト支援", "テスト陣"]);
    expect(labels({ weapon: ["katana", "staff"] })).toEqual(["テストアタッカー", "テスト支援"]);
    expect(labels({ style: ["AS", "ES"] })).toEqual(["テストアタッカー"]);
    expect(labels({ personality: ["東方", "火"] })).toEqual(["テストアタッカー"]);
    expect(labels({ armor: "necklace", sa: "" })).toEqual(["テスト陣"]);
    expect(labels({ sa: "1" })).toEqual(["テストアタッカー"]);
  });

  test("効果の種別・対象・出典・発動条件は、同じ1つの効果に対して絞る", () => {
    const db = testDb();
    const labels = (f: Parameters<typeof searchCharacters>[1]) => searchCharacters(db, f).characters.map((c) => c.label).sort();
    expect(labels({ effectType: "腕力UP" })).toEqual(["テスト支援"]);
    expect(labels({ effect: "火属性", target: "party" })).toEqual(["テスト支援"]);
    expect(labels({ effect: "火属性", target: "self" })).toEqual(["テストアタッカー"]);
    expect(labels({ effect: "火属性", source: "ability" })).toEqual(["テストアタッカー"]);
    expect(labels({ effect: "火属性", source: "skill", target: "enemy" })).toEqual(["テストアタッカー", "テスト支援"]);
    expect(labels({ effectType: "火属性攻撃UP", unconditional: "1" })).toEqual([]);
    expect(searchCharacters(db, { effect: "腕力", target: "ally" }).characters[0]!.matches).toEqual(["<東方>パーソナリティの味方に腕力50%UP"]);
  });
});

describe("枠の判定", () => {
  const setup = () => {
    const db = testDb();
    const partyId = createParty(db, idOf(db, "テストアタッカー"))!;
    return { db, partyId };
  };
  const coverageOf = (db: ReturnType<typeof testDb>, partyId: number) => {
    const party = getParty(db, partyId)!;
    return Object.fromEntries(evaluateCoverage(db, partyContext(db, party), party.members.map((m) => m.id)).map((c) => [c.req.key, c]));
  };

  test("アタッカーの攻撃スキルから属性と攻撃種の既定値が決まる", () => {
    const { db, partyId } = setup();
    const party = getParty(db, partyId)!;
    expect([party.attack_element, party.attack_kind]).toEqual(["火", "斬"]);
    expect(requirementsFor(partyContext(db, party)).map((r) => r.label)).toContain("刀装備者ダメージUP");
  });

  test("アタッカー本人の自己バフはアタッカーの枠を埋める", () => {
    const { db, partyId } = setup();
    expect(coverageOf(db, partyId).unity!.status).toBe("ok");
  });

  test("支援役の効果は対象・条件に応じて ok / 条件未達 になる", () => {
    const { db, partyId } = setup();
    addMember(db, getParty(db, partyId)!, idOf(db, "テスト支援"));
    const c = coverageOf(db, partyId);
    expect(c.elem_res_down!.status).toBe("ok");
    expect(c.type_res_down!.status).toBe("ok");
    expect(c.heal!.status).toBe("ok");
    // <東方>の味方への腕力UPは、東方のアタッカーに当たる
    expect(c.stat_up!.status).toBe("ok");
    // 烈火陣を張れる味方がいないので、烈火陣展開時のバフは ✗ として並ぶだけで枠は埋まらない
    expect(c.elem_atk_up!.status).toBe("missing");
    expect(c.elem_atk_up!.providers[0]!.fit).toEqual({ level: "unmet", note: "条件未達: 烈火陣展開時" });
    expect(c.zone!.status).toBe("missing");

    // 烈火陣を張れる味方を入れると条件を満たす
    addMember(db, getParty(db, partyId)!, idOf(db, "テスト陣"));
    const after = coverageOf(db, partyId);
    expect(after.elem_atk_up!.status).toBe("ok");
    expect(after.elem_atk_up!.providers[0]!.fit.note).toBe("条件OK: 烈火陣展開時");
    // SB はそのターンだけの効果なので、全属性耐性DOWN は「SB時のみ」として並ぶが枠は埋めない
    const sb = after.elem_res_down!.providers.find((p) => p.characterId === idOf(db, "テスト陣"))!;
    expect(sb.fit).toEqual({ level: "sb", note: "SB(天の刻)発動時のみ" });
    const zoneOnly = createParty(db, idOf(db, "テスト陣"))!;
    updateSettings(db, getParty(db, zoneOnly)!, { title: "", memo: "", attackElement: "火", attackKind: "斬", bossElement: "", bossAttack: "", bossNeeds: [] });
    expect(coverageOf(db, zoneOnly).elem_res_down).toMatchObject({ status: "missing", providers: [{ fit: { level: "sb" } }] });
  });

  test("位置・人数・ZONE の条件は編成で判定し、戦闘の流れ次第や未分類のものは判定しない", () => {
    const m = (id: number, slot: "main" | "sub", position: number, personalities: string[], zones: string[] = []) =>
      ({ id, slot, position, personalities, ls_type: "冥", weapon: "katana", gender: null, zones });
    const members = [m(1, "main", 0, ["陰"]), m(2, "main", 1, ["火"], ["極・刻陰陣展開"]), m(3, "main", 2, ["陰"]), m(4, "sub", 0, ["陰"])];
    const state = (clauses: Clause[], subject = 2) => evaluateCondition(clauses, "", subject, members).state;
    const front = { slot: "main" } as const;
    expect(state([front, { neighbors: { personalities: ["陰"] } }])).toBe("met");
    expect(state([front, { neighbors: { personalities: ["陰"] } }], 1)).toBe("unmet");
    const yin = (region: "main" | "all", min: number): Clause => ({ count: { region, who: { personalities: ["陰"] }, min } });
    expect(state([yin("main", 3)])).toBe("unmet"); // 後衛の陰は数えない
    expect(state([yin("all", 3)])).toBe("met");
    expect(state([{ count: { region: "main", who: { personalities: ["陰"] }, min: 2, max: 2 } }])).toBe("met");
    expect(state([{ count: { region: "main", who: { ls: "冥" }, min: 3 } }])).toBe("met");
    expect(state([{ anyOf: [[yin("main", 3)], [{ count: { region: "main", who: { ls: "冥" }, min: 3 } }]] }])).toBe("met");
    expect(state([{ slot: "sub" }])).toBe("unmet");
    expect(state([{ zone: { names: ["刻陰陣"] } }])).toBe("met");
    expect(state([{ zone: { names: ["刻陰陣"], tier: "極・" } }])).toBe("met");
    expect(state([{ zone: { names: ["烈火陣"] } }])).toBe("unmet");
    expect(state([{ frontElements: { distinct: true } }])).toBe("unmet");
    expect(state([front, { battle: "殺意50以上蓄積時" }])).toBe("unknown");
    expect(state([{ unclassified: "新しい条件" }])).toBe("unknown");
    // 判定できない部分があっても、満たさない部分があれば ✗
    expect(state([{ slot: "sub" }, { battle: "HP100%未満" }])).toBe("unmet");
    // 候補（パーティ外）は前衛に置く前提。並び次第の両隣は判定しない
    const guest = { id: 9, personalities: ["陰"], ls_type: "冥", weapon: "katana", gender: null, zones: [] };
    expect(evaluateCondition([yin("main", 3)], "", 9, members, guest).state).toBe("met");
    expect(evaluateCondition([{ neighbors: { personalities: ["陰"] } }], "", 9, members, guest).state).toBe("unknown");
  });

  test("習得スキルにない攻撃種を選ぶと臨機応変の枠が出て、付与できる味方で埋まる", () => {
    const { db, partyId } = setup();
    expect(coverageOf(db, partyId).kind_change).toBeUndefined();
    const settings = { title: "", memo: "", attackElement: "火", bossElement: "", bossAttack: "", bossNeeds: [] };
    updateSettings(db, getParty(db, partyId)!, { ...settings, attackKind: "突" });
    expect(coverageOf(db, partyId).kind_change!).toMatchObject({ status: "missing", req: { label: "臨機応変<突>" } });
    addMember(db, getParty(db, partyId)!, idOf(db, "テスト陣"));
    expect(coverageOf(db, partyId).kind_change!.status).toBe("ok");
    updateSettings(db, getParty(db, partyId)!, { ...settings, attackKind: "魔法" });
    expect(coverageOf(db, partyId).kind_change!).toMatchObject({ status: "missing", req: { label: "臨機応変<魔>" } });
  });

  test("★がなくても火力の枠は出て、本人のみのバフは △、武器種バフはどの武器でも埋まる。★はもう一度押すと外れる", () => {
    const { db, partyId } = setup();
    const attacker = idOf(db, "テストアタッカー");
    setAttacker(db, getParty(db, partyId)!, attacker);
    const party = getParty(db, partyId)!;
    expect(party.attacker_id).toBeNull();
    expect(party.attack_kind).toBe("斬");
    const c = coverageOf(db, partyId);
    expect(c.unity!.status).toBe("partial");
    expect(c.unity!.providers[0]!.fit.note).toBe("本人のみ");
    expect(c.weapon_up!.req.label).toBe("武器種バフ");
    expect(c.weapon_up!.req.match("弓装備者ダメージUP")).toBe(true);
    expect(c.kind_change).toBeUndefined();
  });

  test("候補には枠を埋められるメンバー外のキャラが出る", () => {
    const { db, partyId } = setup();
    const party = getParty(db, partyId)!;
    const ctx = partyContext(db, party);
    const zone = requirementsFor(ctx).find((r) => r.key === "zone")!;
    expect(candidatesFor(db, ctx, zone, [idOf(db, "テストアタッカー")]).map((p) => p.characterId)).toEqual([idOf(db, "テスト陣")]);
  });

  test("オーバークリティカル・挺身・踏ん張るの枠があり、魔法アタッカーなら魔法オーバークリティカルになる", () => {
    const { db, partyId } = setup();
    const party = getParty(db, partyId)!;
    const ctx = partyContext(db, party);
    expect(requirementsFor(ctx).map((r) => r.key)).toEqual(expect.arrayContaining(["over_crit", "devotion", "endure"]));
    const magic = requirementsFor({ ...ctx, attackKind: "魔法" });
    expect(magic.find((r) => r.key === "over_crit")!.label).toBe("魔法オーバークリティカル");
    expect(magic.find((r) => r.key === "devotion")!.hint).toBe("精神を魔力に加算");
  });

  test("敵へのステータスデバフは、固定値版や全ステータスDOWNも含めて攻撃種・想定ボスに合うものだけ一致する", () => {
    const { db, partyId } = setup();
    const ctx = partyContext(db, getParty(db, partyId)!);
    const req = (c: typeof ctx, key: string) => requirementsFor(c).find((r) => r.key === key)!;
    expect(req(ctx, "def_down").match("耐久DOWN(固定値)")).toBe(true);
    expect(req(ctx, "def_down").match("精神DOWN")).toBe(false);
    expect(req({ ...ctx, attackKind: "魔法" }, "def_down").match("精神DOWN")).toBe(true);
    expect(req(ctx, "enemy_atk_down").match("知性DOWN")).toBe(true);
    expect(req({ ...ctx, bossAttack: "physical" }, "enemy_atk_down").match("知性DOWN")).toBe(false);
    expect(req({ ...ctx, bossAttack: "physical" }, "enemy_atk_down").match("全ステータスDOWN")).toBe(true);
  });

  test("想定ボスの設定で耐久・ボス対策の枠が増える", () => {
    const { db, partyId } = setup();
    updateSettings(db, getParty(db, partyId)!, {
      title: "", memo: "", attackElement: "火", attackKind: "斬", bossElement: "火", bossAttack: "magic", bossNeeds: ["break", "unknown"],
    });
    const c = coverageOf(db, partyId);
    expect(c.elem_res_up!.status).toBe("partial"); // アタッカーの火属性耐性UPは本人のみ
    expect(c.res_up!.req.label).toBe("魔法耐性UP");
    expect(c.break).toBeDefined();
    expect(getParty(db, partyId)!.boss_needs).toEqual(["break"]);
  });
});

describe("パーティ編成", () => {
  test("前衛4・後衛2まで入り、満員ならエラー", () => {
    const db = testDb();
    const partyId = createParty(db, idOf(db, "テストアタッカー"))!;
    for (const label of ["テスト支援", "テスト陣", "同名〈甲〉", "同名〈乙〉"]) {
      expect(addMember(db, getParty(db, partyId)!, idOf(db, label)).ok).toBe(true);
    }
    const party = getParty(db, partyId)!;
    expect(party.members.filter((m) => m.slot === "main")).toHaveLength(4);
    expect(party.members.filter((m) => m.slot === "sub")).toHaveLength(1);
    expect(addMember(db, party, idOf(db, "テスト支援")).error).toBe("すでにパーティにいます");
  });

  test("満員の枠へ移すと入れ替わり、アタッカーを外すとアタッカーは未設定になる", () => {
    const db = testDb();
    const attacker = idOf(db, "テストアタッカー");
    const partyId = createParty(db, attacker)!;
    for (const label of ["テスト支援", "テスト陣", "同名〈甲〉", "同名〈乙〉"]) addMember(db, getParty(db, partyId)!, idOf(db, label));
    const sub = idOf(db, "同名〈乙〉");
    moveMember(db, getParty(db, partyId)!, sub);
    const moved = getParty(db, partyId)!;
    expect(moved.members.find((m) => m.id === sub)!.slot).toBe("main");
    expect(moved.members.filter((m) => m.slot === "main")).toHaveLength(4);

    removeMember(db, moved, attacker);
    expect(getParty(db, partyId)!.attacker_id).toBeNull();
  });
});

describe("火力・被ダメの目安", () => {
  const setup = (labels: string[] = ["テスト支援"]) => {
    const db = testDb();
    const partyId = createParty(db, idOf(db, "テストアタッカー"))!;
    for (const label of labels) addMember(db, getParty(db, partyId)!, idOf(db, label));
    const load = () => {
      const party = getParty(db, partyId)!;
      const ctx = partyContext(db, party);
      return { party, ctx, coverage: evaluateCoverage(db, ctx, party.members.map((m) => m.id)) };
    };
    return { db, partyId, load };
  };
  const settings = { title: "", memo: "", attackElement: "火", attackKind: "斬", bossElement: "", bossAttack: "", bossNeeds: [] };

  test("✓ で埋まった枠を計算エンジンに渡し、枠ごとの伸びと支援なしからの倍率を出す", () => {
    const { db, load } = setup();
    const { party, ctx, coverage } = load();
    const dealt = estimateDealt(db, ctx, coverage, party.enemy)!;
    expect(dealt.skill).toMatchObject({ source: "火炎斬", rate: 130, target: "single" });
    // 斬耐性DOWN 30% と火属性耐性DOWN 50% は加算なので、火属性を外すと 1.8 → 1.3
    expect(dealt.gains.get("elem_res_down")).toBeCloseTo(1.8 / 1.3 - 1, 2);
    expect(dealt.gains.get("stat_up")).toBeGreaterThan(0);
    // 烈火陣展開時の火属性攻撃UP は条件未達なので数えない
    expect(dealt.gains.has("elem_atk_up")).toBe(false);
    expect(dealt.multiplier).toBeGreaterThan(1.8);
  });

  test("候補を入れたときの伸びは、その枠の効果だけを足して計算する", () => {
    const { db, load } = setup();
    const { party, ctx, coverage } = load();
    const dealt = estimateDealt(db, ctx, coverage, party.enemy)!;
    const zone = requirementsFor(ctx).find((r) => r.key === "zone")!;
    const [candidate] = candidatesFor(db, ctx, zone, party.members.map((m) => m.id));
    expect(candidate!.characterId).toBe(idOf(db, "テスト陣"));
    expect(dealt.gainWith("zone", candidate!)).toBeCloseTo(0.5, 2); // 烈火陣は火属性 1.5 倍
  });

  test("★や攻撃種がないと与ダメは出さない", () => {
    const { db, partyId, load } = setup();
    updateSettings(db, getParty(db, partyId)!, { ...settings, attackKind: "" });
    const { party, ctx, coverage } = load();
    expect(estimateDealt(db, ctx, coverage, party.enemy)).toBeNull();
  });

  test("被ダメは攻撃が未入力なら支援による軽減率だけ、入れたら実数も出す。本人のみの属性耐性はその本人にだけ効く", () => {
    const { db, partyId, load } = setup([]);
    const taken = () => { const { party, coverage } = load(); return estimateTaken(db, party, coverage, party.enemy); };
    // 未入力: 実数は出さず、支援がないので軽減は 0
    expect(taken()).toEqual([expect.objectContaining({ hp: 3000, damage: null, reduction: 0 })]);
    // テストアタッカーは火属性耐性+30%（アビリティ・本人のみ）。火属性の攻撃なら 30% 軽減
    updateSettings(db, getParty(db, partyId)!, { ...settings, bossElement: "火" });
    expect(taken()[0]!.reduction).toBeCloseTo(0.3, 2);
    const enemy = { atk: 400 };
    updateSettings(db, getParty(db, partyId)!, { ...settings, bossAttack: "physical", bossElement: "火", enemy });
    const fire = taken()[0]!;
    expect(fire.damage).toBeGreaterThan(0);
    updateSettings(db, getParty(db, partyId)!, { ...settings, bossAttack: "physical", enemy });
    expect(fire.damage! / taken()[0]!.damage!).toBeCloseTo(0.7, 2);
  });

  test("未入力の項目は既定値で埋め、どれを既定値にしたかを返す", () => {
    const { values, assumed } = withDefaults({ def: 500, affinity: "weak" });
    expect(values).toMatchObject({ def: 500, mdef: 300, level: 140, atk: 600, power: 150, weapon: 300, armor: 0, affinity: "weak" });
    expect(assumed.map((f) => f.key)).not.toContain("def");
    expect(assumed).toHaveLength(ENEMY_FIELDS.length - 1);
  });

  test("想定ボスの入力は範囲外や数でないものをはじき、保存済みの値も読み直すときに確かめる", () => {
    const { enemy, errors } = enemyFromForm({ enemy_level: "abc", enemy_def: "500", enemy_power: "", enemy_affinity: "weak", enemy_typeRes: "-30" });
    expect(errors).toEqual(["想定ボスの「Lv」は 1〜999 の数で入れてください"]);
    expect(enemy).toEqual({ def: 500, typeRes: -30, affinity: "weak" });
    expect(parseEnemy('{"def":-5,"level":120,"x":1,"affinity":"bad"}')).toEqual({ level: 120 });
    expect(parseEnemy("not json")).toEqual({});
  });
});

describe("効果の分解（対象のパーソナリティ）", () => {
  test("「<剣><弓>パーソナリティの味方に以下の効果を付与」の後ろの効果は、descGroup で対象のパーソナリティを引き継ぐ", () => {
    const [, buff] = extractEffects({
      skills: [{ name: "号令", effects: [
        { description: "前衛の<剣><弓>パーソナリティの味方に以下の効果を付与", types: "特殊", descGroup: "group1" },
        { description: "腕力100%UP(3ターン)", types: "腕力UP", targets: "特定パーソナリティの味方", value: 100, descGroup: "group1" },
      ] }],
    });
    expect(buff!.personalities).toBe("剣、弓");
  });
});
