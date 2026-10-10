-- 発動条件を構造化したもの（anaden-mcp の _condition.clauses の JSON 配列）。空配列なら無条件
ALTER TABLE character_effects ADD COLUMN condition_clauses TEXT NOT NULL DEFAULT '[]';
