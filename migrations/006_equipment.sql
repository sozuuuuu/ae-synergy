-- 武器・防具（anaden-mcp の equipment.export.json から取り込む読み取り専用マスタ。取り込みのたびに入れ替える）
CREATE TABLE equipment (
  id INTEGER PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,      -- 取り込み元の _id
  kind TEXT NOT NULL CHECK (kind IN ('weapon', 'armor')),
  name TEXT NOT NULL,
  type TEXT NOT NULL,                    -- 武器種（characters.weapon と同じ値）・防具の種類（characters.armor と同じ値）
  stat1 INTEGER NOT NULL DEFAULT 0,      -- 武器は攻撃、防具は防御
  stat2 INTEGER NOT NULL DEFAULT 0,      -- 武器は魔力、防具は魔防
  character_name TEXT,                   -- 専用装備の持ち主（汎用なら NULL）
  act_condition TEXT NOT NULL DEFAULT '',-- 効果の発動条件（例: 槌装備者）
  data TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX index_equipment_on_kind_type ON equipment(kind, type);

-- 装備の効果（装備者本人に効く）を1種別1行に分解したもの
CREATE TABLE equipment_effects (
  equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                    -- 固定値のステータスUP は「腕力UP(固定値)」のようにする
  value REAL,
  conditions TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT ''
);
CREATE INDEX index_equipment_effects_on_equipment_id ON equipment_effects(equipment_id);

-- ★に持たせる装備（equipment.external_id）。
-- weapon: '' = 武器種のエルピス（既定。誰でも作れて下克上とクリ率100%が付く）/ 'none' = 数えない
-- armor:  '' = 数えない
ALTER TABLE parties ADD COLUMN weapon TEXT NOT NULL DEFAULT '';
ALTER TABLE parties ADD COLUMN armor TEXT NOT NULL DEFAULT '';
