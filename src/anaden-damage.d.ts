// anaden-mcp の計算エンジン（src/damage.js）の型。使う分だけ書いている。入力の全体は anaden-damage スキルの SKILL.md
declare module "anaden-mcp/src/damage.js" {
  export type Scenario = {
    name?: string;
    attacker?: { str?: number; int?: number; spd?: number; weaponAtk?: number; weaponMag?: number; maxMp?: number; A?: number; B?: number; attr?: number };
    buffs?: { str?: number[]; int?: number[]; spd?: number[]; mp?: number[] };
    skill: {
      kind: "physical" | "magic";
      dep?: "str" | "int" | "spd";
      element?: string;
      target?: "single" | "all";
      tier?: string;
      rate?: number;
      hits?: number;
      ignoreDef?: boolean;
    };
    enemy?: { level?: number; def?: number; mdef?: number; defDebuffs?: number[]; defBuffs?: number[]; affinity?: "normal" | "weak" | "resist" | "absorb" | "null" };
    weakBuff?: boolean;
    lunatic?: { shingan?: boolean; shasin?: boolean };
    mods?: {
      resist?: { typeDebuffs?: number[]; typeBuffs?: number[]; elemDebuffs?: number[]; elemBuffs?: number[] };
      special?: { seishin?: boolean | number; shingi?: boolean | number; gekokujo?: boolean | number; koshi?: boolean | number };
      elemAtkBuffs?: number[];
      weaponBuffs?: number[];
      /** 装備の属性強化など（単純加算） */
      equipElem?: number[];
      /** 装備の下克上（エルピス 320・ムジマ 700 などの定数） */
      equipGekokujo?: number[];
      critDmg?: number[];
      overcrit?: boolean;
      zone?: { rate?: number; ability?: number };
      /** 歌唱の倍率（1.5 = 与ダメ50%UP） */
      song?: number;
      /** true: 通常ブレイク（1hit だけ2倍） / "all": 全hit 2倍 */
      break?: boolean | "all";
      barrier?: number;
      single?: boolean;
    };
  };
  export type Range = { min: number; avg: number; max: number };
  export type Step = { key: string; label: string; factor: number };
  export type Result = {
    name: string;
    total: { normal: Range; crit: Range };
    steps: Step[];
    stepsCrit: Step[];
    extMultiplier: { normal: number; crit: number };
    hits: { hit: number; crit: boolean; parts: { A: number; B: number; def: number; skillMul: number; weakMul: number } }[];
  };
  export function computeScenario(s: Scenario): Result;
  /** 重複減衰: A + A*B + A*B*C ...（大きい順） */
  export function stackDecay(values: number[] | undefined): number;
}
