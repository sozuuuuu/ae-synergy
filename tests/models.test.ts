import { describe, expect, test } from "bun:test";
import { importCharacters } from "../src/models/character-import.ts";
import { searchCharacters } from "../src/models/characters.ts";
import { addMember, createParty, getParty, moveMember, partyContext, removeMember, updateSettings } from "../src/models/parties.ts";
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
    expect(coverageOf(db, partyId).special!.status).toBe("ok");
  });

  test("支援役の効果は対象・条件に応じて ok / partial になる", () => {
    const { db, partyId } = setup();
    addMember(db, getParty(db, partyId)!, idOf(db, "テスト支援"));
    const c = coverageOf(db, partyId);
    expect(c.elem_res_down!.status).toBe("ok");
    expect(c.type_res_down!.status).toBe("ok");
    expect(c.heal!.status).toBe("ok");
    // <東方>の味方への腕力UPは、東方のアタッカーに当たる
    expect(c.stat_up!.status).toBe("ok");
    // 烈火陣展開時の条件付きバフは partial
    expect(c.elem_atk_up!.status).toBe("partial");
    expect(c.elem_atk_up!.providers[0]!.fit.note).toContain("烈火陣展開時");
    expect(c.zone!.status).toBe("missing");
  });

  test("候補には枠を埋められるメンバー外のキャラが出る", () => {
    const { db, partyId } = setup();
    const party = getParty(db, partyId)!;
    const ctx = partyContext(db, party);
    const zone = requirementsFor(ctx).find((r) => r.key === "zone")!;
    expect(candidatesFor(db, ctx, zone, [idOf(db, "テストアタッカー")]).map((p) => p.characterId)).toEqual([idOf(db, "テスト陣")]);
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
