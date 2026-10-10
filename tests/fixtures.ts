import { openDb } from "../src/db.ts";
import { importCharacters } from "../src/models/character-import.ts";

/** anaden-mcp の補強済みデータと同じ形の架空キャラ（発動条件は _condition） */
export const ROWS = [
  {
    _id: "a1", name: "テストアタッカー", engName: "Attacker", class: "剣士", style: "AS", rarity: 5, weaponType: "katana",
    armorType: "ring", lsType: "冥", gender: "男性", obtain: "夢見", isAlter: false, isSA: true,
    personalities: ["刀", "火", "東方"], stats: { lvMax: { hp: 3000, pwr: 300 } },
    skills: [
      { no: 1, name: "火炎斬", mpCost: 50, effects: [{ description: "敵単体に火属性の斬攻撃(大)", element: "火", types: "斬攻撃", targets: "敵単体", value: 1.3 }] },
      { no: 2, name: "集中", mpCost: 30, effects: [{ description: "自身に心技一体(3ターン)", types: "心技一体", targets: "自身", turn: 3 }] },
    ],
    abilities: [{ description: "火属性耐性+30%", types: "火属性耐性UP", value: 30 }],
  },
  {
    _id: "s1", name: "テスト支援", engName: "Support", class: "術士", style: "NS", rarity: 5, weaponType: "staff",
    armorType: "bangle", lsType: "天", gender: "女性", obtain: "夢見", isAlter: false, isSA: false,
    personalities: ["杖", "水", "東方"],
    skills: [
      { no: 1, name: "弱体の霧", mpCost: 40, effects: [
        { description: "敵全体に火属性耐性50%DOWN(3ターン)", types: "火属性耐性DOWN", targets: "敵全体", value: 50, turn: 3 },
        { description: "敵全体に斬耐性30%DOWN(3ターン)", types: "斬耐性DOWN", targets: "敵全体", value: 30, turn: 3 },
      ] },
      { no: 2, name: "癒しの雨", mpCost: 40, effects: [{ description: "味方全体のHPを回復", types: "HP回復(割合)", targets: "味方全体", value: 30 }] },
      { no: 3, name: "鼓舞", mpCost: 40, effects: [
        { description: "<東方>パーソナリティの味方に腕力50%UP", types: "腕力UP", targets: "特定パーソナリティの味方", value: 50, personalities: ["東方"] },
        { description: "烈火陣展開時、味方全体に火属性攻撃40%UP", types: "火属性攻撃UP", targets: "味方全体", value: 40, conditions: "烈火陣展開時",
          _condition: { text: "烈火陣展開時", clauses: [{ zone: { names: ["烈火陣"] } }] } },
      ] },
    ],
  },
  {
    _id: "z1", name: "テスト陣", engName: "Zone", class: "陣師", style: "NS", rarity: 4, weaponType: "lance",
    armorType: "necklace", lsType: "天", gender: "不明", obtain: "夢見以外", isAlter: false, isSA: false,
    personalities: ["槍", "火"],
    skills: [{ no: 1, name: "烈火招来", mpCost: 30, effects: [{ description: "烈火陣を展開する", types: "烈火陣展開" }] }],
  },
  {
    _id: "d1", name: "同名", class: "甲", style: "NS", rarity: 5, weaponType: "sword", personalities: ["剣"], skills: [],
  },
  {
    _id: "d2", name: "同名", class: "乙", style: "NS", rarity: 5, weaponType: "bow", personalities: ["弓"], skills: [],
  },
];

export function testDb() {
  const db = openDb(":memory:");
  importCharacters(db, ROWS);
  return db;
}

export const idOf = (db: ReturnType<typeof testDb>, label: string) =>
  db.query<{ id: number }, any>("SELECT id FROM characters WHERE label = $label").get({ label })!.id;
