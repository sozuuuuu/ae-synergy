-- 時刻はすべて UTC の ISO8601 文字列

-- 外部データから取り込む読み取り専用マスタ
CREATE TABLE characters (
  id INTEGER PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,      -- 取り込み元の _id
  name TEXT NOT NULL,
  label TEXT NOT NULL UNIQUE,            -- 同名キャラを区別した一意な表示名
  eng_name TEXT,
  class_name TEXT,
  true_name TEXT,
  style TEXT NOT NULL CHECK (style IN ('NS', 'AS', 'ES')),
  rarity INTEGER NOT NULL,
  weapon TEXT NOT NULL,                  -- staff sword katana ax lance bow fists hammer
  armor TEXT,                            -- ring bangle necklace
  ls_type TEXT,                          -- 天 / 冥
  element TEXT,                          -- 代表属性（属性パーソナリティの先頭）
  gender TEXT,
  obtain TEXT,
  is_alter INTEGER NOT NULL DEFAULT 0,
  is_sa INTEGER NOT NULL DEFAULT 0,      -- 星の夢 (Stellar Awakening)
  search_text TEXT NOT NULL DEFAULT '',  -- 正規化した名前・英名・クラス名など
  data TEXT NOT NULL DEFAULT '{}',       -- 取り込み元の全データ (JSON)
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX index_characters_on_name ON characters(name);

CREATE TABLE personalities (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('element', 'weapon', 'other'))
);

CREATE TABLE character_personalities (
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  personality_id INTEGER NOT NULL REFERENCES personalities(id) ON DELETE CASCADE,
  PRIMARY KEY (character_id, personality_id)
);
CREATE INDEX index_character_personalities_on_personality_id ON character_personalities(personality_id);

-- キャラの効果を1種別1行に分解したもの。どの枠を埋めるかの判定はアプリ側のルールで行う
CREATE TABLE character_effects (
  id INTEGER PRIMARY KEY,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                    -- 取り込み元の types（例: 火属性耐性DOWN）
  scope TEXT NOT NULL,                   -- self / party / ally / conditional / enemy / other
  targets TEXT NOT NULL DEFAULT '',      -- 取り込み元の targets（例: 味方全体）
  value REAL,                            -- 効果量（% など）
  turns INTEGER,
  element TEXT,                          -- 攻撃の属性（攻撃効果のみ）
  conditions TEXT NOT NULL DEFAULT '',   -- 発動条件（空なら無条件）
  personalities TEXT NOT NULL DEFAULT '',-- 対象パーソナリティ（「、」区切り）
  description TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',       -- 出典（スキル名・VC Lv3・アビリティなど）
  search_text TEXT NOT NULL DEFAULT ''   -- 正規化した説明・種別・条件・出典（効果キーワード検索用）
);
CREATE INDEX index_character_effects_on_type ON character_effects(type);
CREATE INDEX index_character_effects_on_character_id ON character_effects(character_id);

-- パーティ（一人用）
CREATE TABLE parties (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  memo TEXT NOT NULL DEFAULT '',
  attacker_id INTEGER REFERENCES characters(id) ON DELETE SET NULL, -- アタッカー（火力枠の判定の基準）
  attack_element TEXT NOT NULL DEFAULT '',  -- 火 地 水 風 雷 陰 晶 無
  attack_kind TEXT NOT NULL DEFAULT '',     -- 斬 突 打 魔法
  boss_element TEXT NOT NULL DEFAULT '',    -- 想定ボスの攻撃属性
  boss_attack TEXT NOT NULL DEFAULT '',     -- physical / magic
  boss_needs TEXT NOT NULL DEFAULT '[]',    -- 想定ボスへの必須能力のキー (JSON 配列)
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- slot: main=前衛(0..3) sub=後衛(0..1)
CREATE TABLE party_members (
  party_id INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL REFERENCES characters(id),
  slot TEXT NOT NULL CHECK (slot IN ('main', 'sub')),
  position INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (party_id, slot, position),
  UNIQUE (party_id, character_id)
);
CREATE INDEX index_party_members_on_character_id ON party_members(character_id);
