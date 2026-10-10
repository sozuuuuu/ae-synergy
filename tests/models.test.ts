import { describe, expect, test } from "bun:test";
import { importCharacters } from "../src/models/character-import.ts";
import { searchCharacters } from "../src/models/characters.ts";
import { addMember, createParty, getParty, moveMember, partyContext, removeMember, updateSettings } from "../src/models/parties.ts";
import { evaluateCondition } from "../src/models/conditions.ts";
import { conditionInDescription, extractEffects } from "../src/models/effect-extract.ts";
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
});

describe("効果の分解", () => {
  test("conditions が空でも、説明文の頭の「〜場合、」「〜時、」を条件として拾う", () => {
    expect(conditionInDescription("前衛でターン開始時、自身の前衛両隣に<陰>パーソナリティの味方がいる場合、 自身にルナティック<捨身>(ターン終了時まで)"))
      .toBe("前衛でターン開始時、自身の前衛両隣に<陰>パーソナリティの味方がいる場合");
    expect(conditionInDescription("ベズナギア15以上蓄積時、15消費して弱点看破 ※攻撃対象が全て打弱点の場合、消費しない")).toBe("ベズナギア15以上蓄積時");
    expect(conditionInDescription("呪いを即座に発動させる この時、威力が増加")).toBe("");
    expect(conditionInDescription("敵全体に火属性耐性50%DOWN(3ターン)")).toBe("");
  });

  test("蓄積の効果は、その蓄積が溜まっている時という条件になる", () => {
    const [effect] = extractEffects({
      stack: [{ name: "特製マタタビ", cond: [{ stack: "スキル「神鏡」使用時、1蓄積", cons: ["1ターン経過後に全て消費"] }],
        effects: [{ description: "ルナティック(捨身)の効果", types: "ルナティック(捨身)", targets: "味方" }] }],
    });
    expect(effect!.conditions).toBe("特製マタタビ蓄積時（スキル「神鏡」使用時、1蓄積）");
    expect(evaluateCondition(effect!.conditions, 1, []).state).toBe("unknown");
  });

  test("歌唱・祈祷・モードチェンジの効果は、その状態の間だけという条件になる", () => {
    const conditions = extractEffects({
      sing: [{ no: 1, name: "アーデインアスピダ", effects: [{ description: "ルナティック<捨身>", types: "ルナティック(捨身)", targets: "味方全体" }] }],
      prayerActivate: [{ name: "レズィストンス", actTiming: "ターン開始時", ver: "極・招雷陣展開時", effects: [{ description: "", types: "庇立て", targets: "自身" }] }],
      modeChange: [{ name: "天の導き", modeCond: [{ act: "前衛で戦闘開始時、前衛に天の味方が3人以上の場合に変化", deact: "永続" }],
        effects: [{ description: "ターン開始時、自身に心技一体(1ターン)", types: "心技一体", targets: "自身", conditions: "ターン開始時" }] }],
    }).map((e) => e.conditions);
    expect(conditions.sort()).toEqual([
      "モード「天の導き」中（前衛で戦闘開始時、前衛に天の味方が3人以上の場合に変化） / ターン開始時",
      "歌唱「アーデインアスピダ」中",
      "祈祷「レズィストンス」中のターン開始時、極・招雷陣展開時",
    ]);
    // モードの変化条件が編成で満たせなければ ✗
    expect(evaluateCondition(conditions[0]!, 1, [{ id: 1, slot: "main", position: 0, personalities: [], ls_type: "冥", weapon: "staff", gender: null, zones: [] }]).state).toBe("unmet");
  });

  test("親の条件と同じ内容は重ねない", () => {
    const [effect] = extractEffects({
      skills: [{ name: "覚醒", effects: [{ conditions: "自身でZONE覚醒時", effects: [{ description: "自身でZONE覚醒時、 自身にルナティック<挺身>(3ターン)", types: "ルナティック(挺身)", targets: "自身" }] }] }],
    });
    expect(effect!.conditions).toBe("自身でZONE覚醒時");
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
  });

  test("位置・人数の条件は並びとパーソナリティで判定し、戦闘の流れ次第のものは判定しない", () => {
    const m = (id: number, slot: "main" | "sub", position: number, personalities: string[]) =>
      ({ id, slot, position, personalities, ls_type: "冥", weapon: "katana", gender: null, zones: [] });
    const members = [m(1, "main", 0, ["陰"]), m(2, "main", 1, ["火"]), m(3, "main", 2, ["陰"]), m(4, "sub", 0, ["陰"])];
    const state = (text: string, subject = 2) => evaluateCondition(text, subject, members).state;
    expect(state("前衛でターン開始時、自身の前衛両隣に<陰>パーソナリティの味方がいる場合")).toBe("met");
    expect(state("前衛でターン開始時、自身の前衛両隣に<陰>パーソナリティの味方がいる場合", 1)).toBe("unmet");
    expect(state("前衛の<陰>パーソナリティの味方3人以上")).toBe("unmet"); // 後衛の陰は数えない
    expect(state("味方前衛後衛の<陰>パーソナリティの味方3人以上")).toBe("met");
    expect(state("前衛の冥の味方3人以上")).toBe("met");
    expect(state("後衛でターン開始時")).toBe("unmet");
    expect(state("ZONE展開時")).toBe("unmet");
    expect(state("殺意50以上蓄積時")).toBe("unknown");
    expect(state("前衛でターン開始時、自身のHPが100%未満の場合")).toBe("unknown");
    // 候補（パーティ外）は前衛に置く前提。並び次第の両隣は判定しない
    const guest = { id: 9, personalities: ["陰"], ls_type: "冥", weapon: "katana", gender: null, zones: [] };
    expect(evaluateCondition("前衛の<陰>パーソナリティの味方3人以上", 9, members, guest).state).toBe("met");
    expect(evaluateCondition("自身の前衛両隣に<陰>パーソナリティの味方がいる場合", 9, members, guest).state).toBe("unknown");
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
