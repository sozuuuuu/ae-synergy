import { describe, expect, test } from "bun:test";
import { createApp } from "../src/app.tsx";
import { autoBuild, autofillParty, personOf } from "../src/models/autobuild.ts";
import { importCharacters as importRows } from "../src/models/character-import.ts";
import { BuildError, runBuild } from "../src/models/build-request.ts";
import { searchCharacters, setOwned } from "../src/models/characters.ts";
import { findEquipment, importEquipment } from "../src/models/equipment.ts";
import { attackSkill, estimateDealt } from "../src/models/estimate.ts";
import { addMember, createParty, getParty, partyContext } from "../src/models/parties.ts";
import { evaluateCoverage } from "../src/models/requirements.ts";
import { idOf, ROWS, testDb } from "./fixtures.ts";

const labels = (r: ReturnType<typeof autoBuild>) => r!.members.map((m) => m.character.label).sort();

describe("自動編成", () => {
  test("★から、足りない枠を埋めるキャラを足していく", () => {
    const db = testDb();
    const result = autoBuild(db, { attackerId: idOf(db, "テストアタッカー") })!;
    expect(labels(result)).toEqual(["テストアタッカー", "テスト支援", "テスト陣"].sort());
    expect(result.members[0]).toMatchObject({ slot: "main", position: 0, fixed: true });
    expect(result.members.find((m) => m.character.label === "テスト支援")!.fills).toContain("火属性耐性DOWN");
    // 何も埋めない「同名」は足さない
    expect(result.members.some((m) => m.character.name === "同名")).toBe(false);
  });

  test("持っていないキャラは候補にしない（--all 相当なら入れる）", () => {
    const db = testDb();
    setOwned(db, idOf(db, "テスト支援"), false);
    expect(searchCharacters(db, { owned: "0" }).characters.map((c) => c.label)).toEqual(["テスト支援"]);
    expect(labels(autoBuild(db, { attackerId: idOf(db, "テストアタッカー") }))).not.toContain("テスト支援");
    expect(labels(autoBuild(db, { attackerId: idOf(db, "テストアタッカー"), ownedOnly: false }))).toContain("テスト支援");
    setOwned(db, idOf(db, "テスト支援"), true);
    expect(labels(autoBuild(db, { attackerId: idOf(db, "テストアタッカー") }))).toContain("テスト支援");
  });

  test("同じキャラの別スタイルは同時に入れない", () => {
    expect(personOf("アルド(AS)")).toBe("アルド");
    expect(personOf("フラムラピス(ES)")).toBe("フラムラピス");
    const db = testDb();
    const support = ROWS.find((r) => r._id === "s1")!;
    importRows(db, [...ROWS, { ...support, _id: "s2", name: "テスト支援(AS)", style: "AS" }]);
    const result = autoBuild(db, { attackerId: idOf(db, "テストアタッカー") })!;
    expect(result.members.filter((m) => personOf(m.character.name) === "テスト支援")).toHaveLength(1);
  });

  test("保存済みのパーティは、今のメンバーと席を残して空きを埋める", () => {
    const db = testDb();
    const id = createParty(db, idOf(db, "テストアタッカー"))!;
    const { added } = autofillParty(db, getParty(db, id)!);
    expect(added.map((c) => c.label).sort()).toEqual(["テスト支援", "テスト陣"]);
    const party = getParty(db, id)!;
    expect(party.members.find((m) => m.id === party.attacker_id)).toMatchObject({ slot: "main", position: 0 });
    expect(autofillParty(db, { ...party, attacker_id: null }).error).toContain("★");
  });

  test("画面から自動で組める", async () => {
    const db = testDb();
    const app = createApp(db);
    const post = (path: string, fields: Record<string, string>) =>
      app.handle(new Request(`http://localhost${path}`, {
        method: "POST", body: new URLSearchParams(fields),
        headers: { "content-type": "application/x-www-form-urlencoded", host: "localhost", origin: "http://localhost" },
      }));
    const res = await post("/parties/auto", { attacker_id: String(idOf(db, "テストアタッカー")) });
    expect(res.status).toBe(303);
    const partyId = Number(new URL(res.headers.get("location")!, "http://localhost").pathname.split("/").pop());
    expect(getParty(db, partyId)!.members).toHaveLength(3);
    expect((await post(`/parties/${partyId}/autofill`, { need: "heal" })).status).toBe(303);
    expect((await post(`/characters/${idOf(db, "テスト陣")}/owned`, { owned: "0" })).status).toBe(303);
    const page = await (await app.handle(new Request(`http://localhost/characters/${idOf(db, "テスト陣")}`))).text();
    expect(page).toContain("持っていない");
  });
});

describe("前衛と後衛", () => {
  test("VC と後衛の効果は枠を埋めない（VC は並べるだけ）", () => {
    const db = testDb();
    importRows(db, [...ROWS, {
      _id: "v1", name: "テストVC", class: "歌い手", style: "NS", rarity: 5, weaponType: "bow", personalities: ["弓", "風"],
      skills: [{ no: 1, name: "鼓舞", effects: [{ description: "味方全体の腕力50%UP", types: "腕力UP", targets: "味方全体", value: 50 }] }],
      valorChant: [{ level: 3, effects: [{ description: "敵全体に斬耐性40%DOWN", types: "斬耐性DOWN", targets: "敵全体", value: 40 }] }],
    }]);
    const attacker = idOf(db, "テストアタッカー");
    const vc = idOf(db, "テストVC");
    const coverageWith = (slot: "main" | "sub") => {
      const id = createParty(db, attacker)!;
      addMember(db, getParty(db, id)!, vc, slot);
      const party = getParty(db, id)!;
      const status = (key: string) => evaluateCoverage(db, partyContext(db, party), party.members.map((m) => m.id)).find((c) => c.req.key === key)!.status;
      const levels = evaluateCoverage(db, partyContext(db, party), party.members.map((m) => m.id))
        .find((c) => c.req.key === "type_res_down")!.providers.filter((p) => p.characterId === vc).map((p) => p.fit.level);
      return { typeRes: status("type_res_down"), stat: status("stat_up"), levels };
    };
    expect(coverageWith("main")).toEqual({ typeRes: "missing", stat: "ok", levels: ["vc"] });
    expect(coverageWith("sub")).toEqual({ typeRes: "missing", stat: "missing", levels: ["vc"] });
  });

  test("自動編成は前衛だけを組む", () => {
    const db = testDb();
    const result = autoBuild(db, { attackerId: idOf(db, "テストアタッカー") })!;
    expect(result.members.every((m) => m.slot === "main")).toBe(true);
  });
});

describe("火力優先と必須の枠", () => {
  test("指定した枠は必ず満たし、満たせなければ missing に出す", () => {
    const db = testDb();
    const attackerId = idOf(db, "テストアタッカー");
    const healed = autoBuild(db, { attackerId, need: ["heal"] })!;
    expect(healed.required).toContain("heal");
    expect(healed.missing).toEqual([]);
    expect(labels(healed)).toContain("テスト支援");
    // 誰も持っていない枠は満たせない
    expect(autoBuild(db, { attackerId, need: ["buff_reversal"] })!.missing).toEqual(["バフリバーサル"]);
  });
});

describe("★の装備", () => {
  const EQUIPMENT = {
    weapons: [
      { _id: "w1", category: "weapon", types: "katana", name: "エルピスダガー", attack: 237, magic: 39, ability: [{ effects: [
        { description: "下克上[ダメージ+{(敵のLv)<sup>2</sup>/320}%]", types: "下克上", targets: "自身", value: 320 },
        { description: "物理クリティカル率+100%", types: "物理クリティカル率UP", targets: "自身", value: 100 },
      ] }] },
      { _id: "w2", category: "weapon", types: "katana", name: "速い刀", attack: 200, magic: 10, ability: [{ effects: [
        { description: "速度+30", types: "速度UP", targets: "自身", value: 30 },
      ] }] },
    ],
    armors: [
      { _id: "a1", category: "armor", types: "ring", name: "刀の指輪", defense: 100, magicDefense: 100, actCondition: "刀装備者", ability: [{ effects: [
        { description: "物理クリティカルダメージ+30%", types: "物理クリティカルダメージUP", targets: "自身", value: 30 },
      ] }] },
      { _id: "a2", category: "armor", types: "ring", name: "槌の指輪", defense: 100, magicDefense: 100, actCondition: "槌装備者", ability: [{ effects: [
        { description: "物理クリティカルダメージ+30%", types: "物理クリティカルダメージUP", targets: "自身", value: 30 },
      ] }] },
    ],
  };
  const UNDERDOG = {
    _id: "u1", name: "テスト下克上", class: "応援", style: "NS", rarity: 5, weaponType: "bow", personalities: ["弓"],
    skills: [{ no: 1, name: "下克上の歌", effects: [{ description: "味方全体に下克上(3ターン)", types: "下克上", targets: "味方全体", turn: 3 }] }],
  };
  const setup = () => {
    const db = testDb();
    importRows(db, [...ROWS, UNDERDOG]);
    importEquipment(db, EQUIPMENT);
    return db;
  };

  test("取り込みで固定値のステータスUP を見分け、発動条件を残す", () => {
    const db = setup();
    expect(db.query("SELECT e.type FROM equipment_effects e JOIN equipment q ON q.id = e.equipment_id WHERE q.name = '速い刀'").get()).toEqual({ type: "速度UP(固定値)" });
    expect(findEquipment(db, "刀の指輪", "armor")?.act_condition).toBe("刀装備者");
  });

  test("既定はエルピス武器で、その枠（下克上）のキャラは評価しない", () => {
    const db = setup();
    const attackerId = idOf(db, "テストアタッカー");
    const result = autoBuild(db, { attackerId })!;
    expect(result.gear.items.map((x) => x.name)).toEqual(["エルピスダガー"]);
    expect(result.gear.fills).toContain("下克上");
    expect(labels(result)).not.toContain("テスト下克上");
    // 武器なしなら下克上のキャラが火力を伸ばすので入る
    expect(labels(autoBuild(db, { attackerId, weapon: "none" }))).toContain("テスト下克上");
  });

  test("防具は発動条件（武器種）を満たすときだけ効く", () => {
    const db = setup();
    const attackerId = idOf(db, "テストアタッカー");
    const critDmg = (armor: string) => autoBuild(db, { attackerId, armor })!.gear.fills.includes("物理クリティカルダメージUP");
    expect(critDmg(findEquipment(db, "刀の指輪")!.external_id)).toBe(true);
    expect(critDmg(findEquipment(db, "槌の指輪")!.external_id)).toBe(false);
  });

  test("名前で依頼でき、武器種が合わない装備は断る", () => {
    const db = setup();
    expect(runBuild(db, { attacker: "テストアタッカー", weapon: "速い刀" }).text).toContain("武器 速い刀");
    expect(() => runBuild(db, { attacker: "テストアタッカー", armor: "存在しない" })).toThrow(BuildError);
    expect(() => runBuild(db, { attacker: "テストアタッカー", need: ["nope"] })).toThrow("need に使えないキー");
  });
});

describe("取り込み（_id の振り直し）", () => {
  test("_id が変わっても名前・クラス・スタイルが同じなら同じキャラとして更新する", () => {
    const db = testDb();
    const id = idOf(db, "テスト支援");
    const party = createParty(db, idOf(db, "テストアタッカー"))!;
    addMember(db, getParty(db, party)!, id, "main");
    const result = importRows(db, ROWS.map((r) => ({ ...r, _id: `new-${r._id}` })));
    expect(result.created).toBe(0);
    expect(idOf(db, "テスト支援")).toBe(id);
    expect(db.query("SELECT COUNT(*) AS n FROM characters WHERE label LIKE '%旧データ%'").get()).toEqual({ n: 0 });
  });
});

describe("攻撃値の参照元（〜依存）", () => {
  test("腕力依存の魔法アタッカーは、腕力UP の枠を見て、腕力と武器の攻撃で計算する", () => {
    const db = testDb();
    importRows(db, [...ROWS, {
      _id: "m1", name: "テスト剣魔", class: "剣聖", style: "NS", rarity: 5, weaponType: "sword", personalities: ["剣", "水", "東方"],
      stats: { lvMax: { hp: 3000, mp: 400, pwr: 250, int: 170, spd: 200 } },
      skills: [{ no: 1, name: "水剣", mpCost: 30, effects: [{ description: "敵単体に水属性の魔法攻撃(大)", element: "水", types: "魔法攻撃", targets: "敵単体", value: 1.3,
        add: [{ description: "自身の腕力に応じた威力", types: "腕力依存" }] }] }],
    }]);
    const id = createParty(db, idOf(db, "テスト剣魔"))!;
    const party = getParty(db, id)!;
    const ctx = partyContext(db, party);
    expect(ctx.attacker?.dep).toBe("str");
    const coverage = evaluateCoverage(db, ctx, [idOf(db, "テスト剣魔")]);
    expect(coverage.find((c) => c.req.key === "stat_up")!.req.label).toBe("腕力UP");
  });
});

describe("ZONE は1つだけ", () => {
  const THUNDER = {
    _id: "t1", name: "テスト雷陣", class: "雷", style: "NS", rarity: 5, weaponType: "staff", personalities: ["杖", "雷"],
    skills: [{ no: 1, name: "雷の加護", effects: [{ description: "招雷陣展開時、味方全体に腕力50%UP", types: "腕力UP", targets: "味方全体", value: 50,
      conditions: "招雷陣展開時", _condition: { text: "招雷陣展開時", clauses: [{ zone: { names: ["招雷陣"] } }] } }] }],
    uniqueAbility: [{ effects: [{ description: "極・招雷陣を展開する", types: "極・招雷陣展開", conditions: "前衛で戦闘開始時",
      _condition: { text: "前衛で戦闘開始時", clauses: [{ slot: "main" }] } }] }],
  };

  test("★に合う陣を張り、ほかの陣が条件の効果は数えず、開幕に別の陣を張るメンバーを衝突として出す", () => {
    const db = testDb();
    importRows(db, [...ROWS, THUNDER]);
    const id = createParty(db, idOf(db, "テストアタッカー"))!;
    for (const label of ["テスト陣", "テスト雷陣"]) addMember(db, getParty(db, id)!, idOf(db, label), "main");
    const party = getParty(db, id)!;
    const ctx = partyContext(db, party);
    expect(ctx.zone?.active?.name).toBe("烈火陣");
    expect(ctx.zone?.conflicts.map((c) => c.zone.name)).toEqual(["招雷陣"]);
    const coverage = evaluateCoverage(db, ctx, party.members.map((m) => m.id));
    const thunder = coverage.find((c) => c.req.key === "stat_up")!.providers.find((p) => p.characterId === idOf(db, "テスト雷陣"))!;
    expect(thunder.fit.level).toBe("unmet");
    const zone = coverage.find((c) => c.req.key === "zone")!;
    expect(zone.providers.find((p) => p.characterId === idOf(db, "テスト雷陣"))?.fit.level).toBe("unmet");
    // 招雷陣を張る前提にすると、雷陣の効果が効く
    const thunderCtx = partyContext(db, party, { zone: "招雷陣" });
    expect(thunderCtx.zone?.active).toMatchObject({ name: "招雷陣", tier: "極・" });
  });

  test("自動編成は開幕に別の陣を張るキャラを避ける", () => {
    const db = testDb();
    importRows(db, [...ROWS, THUNDER]);
    expect(labels(autoBuild(db, { attackerId: idOf(db, "テストアタッカー") }))).not.toContain("テスト雷陣");
  });
});

describe("火力の目安に使う攻撃スキル", () => {
  test("カウンターは使わず、1hit の威力×回数で一番強いスキルを選ぶ", () => {
    const db = testDb();
    importRows(db, [...ROWS, {
      _id: "k1", name: "テスト連撃", class: "剣士", style: "NS", rarity: 5, weaponType: "sword", personalities: ["剣", "水"],
      stats: { lvMax: { hp: 3000, mp: 400, pwr: 250, int: 100, spd: 200 } },
      skills: [
        { no: 1, name: "単発", effects: [{ description: "敵単体に水属性の斬攻撃(特大)", element: "水", types: "斬攻撃", targets: "敵単体", value: 5 }] },
        { no: 2, name: "四連", effects: [{ description: "敵単体に水属性の斬攻撃4回(極大)", element: "水", types: "斬攻撃", targets: "敵単体", value: 3 }] },
      ],
      counter: [{ effects: [{ description: "敵単体に水属性の斬攻撃(特大 10倍)", element: "水", types: "斬攻撃", targets: "敵単体", value: 20 }] }],
    }]);
    const skill = attackSkill(db, idOf(db, "テスト連撃"), "水", "斬")!;
    expect(skill).toMatchObject({ source: "四連", hits: 4 });
  });
});

describe("敵へのデバフ", () => {
  test("単体のデバフも ✓（ボス1体の想定）で、重ねがけできる分は効果量×回数で数える", () => {
    const db = testDb();
    importRows(db, [...ROWS, {
      _id: "s9", name: "テスト単体", class: "狩人", style: "NS", rarity: 5, weaponType: "bow", personalities: ["弓"],
      skills: [{ no: 1, name: "重ね撃ち", effects: [{ description: "攻撃対象に全属性耐性50%DOWN(3ターン 最高累積回数3)", types: "全属性耐性DOWN", targets: "敵単体", value: 50 }] }],
    }]);
    const id = createParty(db, idOf(db, "テストアタッカー"))!;
    addMember(db, getParty(db, id)!, idOf(db, "テスト単体"), "main");
    const party = getParty(db, id)!;
    const ctx = partyContext(db, party);
    const coverage = evaluateCoverage(db, ctx, party.members.map((m) => m.id));
    const elem = coverage.find((c) => c.req.key === "elem_res_down")!;
    expect(elem.status).toBe("ok");
    // 50% の1回分ではなく 150%（上限 -100% で頭打ち）で計算するので、1回分よりよく伸びる
    const dealt = estimateDealt(db, ctx, coverage, {})!;
    expect(dealt.gains.get("elem_res_down")!).toBeGreaterThan(0.5);
  });
});

describe("自分でなれる状態・敵の状態異常・効果量増加・歌唱・ブレイク", () => {
  const SINGER = {
    _id: "sg1", name: "テスト歌姫", class: "詩人", style: "NS", rarity: 5, weaponType: "bow", personalities: ["弓"],
    skills: [
      { no: 0, name: "ルナティック", effects: [{ description: "自身にルナティック<心眼>(3ターン)", types: "ルナティック(心眼)", targets: "自身" }] },
      { no: 1, name: "射撃", effects: [{ description: "攻撃対象に物理耐性40%DOWN(3ターン)", types: "物理耐性DOWN", targets: "敵単体", value: 40,
        conditions: "ルナティック時", _condition: { text: "ルナティック時", clauses: [{ selfState: "ルナティック" }] } }] },
      { no: 2, name: "毒矢", effects: [{ description: "敵全体に猛毒", types: "猛毒", targets: "敵全体", value: 1 }] },
      { no: 3, name: "鼓舞", effects: [
        { description: "味方全体に物理クリティカルダメージ30%UP(3ターン)", types: "物理クリティカルダメージUP", targets: "味方全体", value: 30 },
        { description: "いずれかの敵が毒状態の時、物理クリティカルダメージUPの効果量増加(2倍)", types: "特殊", targets: "味方全体",
          conditions: "いずれかの敵が毒状態の時", _condition: { text: "いずれかの敵が毒状態の時", clauses: [{ enemyStatus: ["毒", "猛毒"] }] } },
      ] },
      { no: 4, name: "割る", effects: [{ description: "攻撃対象にウェポンブレイク(斬突)を3蓄積", types: "ウェポンブレイク(斬突)", targets: "敵単体", value: 3 }] },
    ],
    sing: [{ name: "勝利の唄", effects: [{ description: "与えるダメージ50%UP", types: "与ダメUP", targets: "味方全体", value: 50,
      _condition: { text: "歌唱「勝利の唄」中", clauses: [{ selfState: "歌唱" }] } }] }],
  };

  test("自分でルナティックになれる・毒を撒ける・歌えるなら条件を満たし、効果量増加も掛かる", () => {
    const db = testDb();
    importRows(db, [...ROWS, SINGER]);
    // 歌唱スキルを持たない歌い手は「歌唱」に自分でなれない扱い。歌唱を発動するスキルを足す
    db.query("INSERT INTO character_effects (character_id, type, scope, targets, conditions, source) VALUES ($id, '歌唱', 'other', '', '', '勝利の唄')").run({ id: idOf(db, "テスト歌姫") });
    const id = createParty(db, idOf(db, "テストアタッカー"))!;
    addMember(db, getParty(db, id)!, idOf(db, "テスト歌姫"), "main");
    const party = getParty(db, id)!;
    const ctx = partyContext(db, party);
    const coverage = evaluateCoverage(db, ctx, party.members.map((m) => m.id));
    const of = (key: string) => coverage.find((c) => c.req.key === key)!;
    const singer = idOf(db, "テスト歌姫");
    expect(of("type_res_down").providers.find((p) => p.characterId === singer)?.fit.level).toBe("full");
    expect(of("crit_dmg").providers.find((p) => p.characterId === singer)?.effect.value).toBe(60);
    expect(of("song").status).toBe("ok");
    expect(of("break_hit").status).toBe("ok");
  });
});
