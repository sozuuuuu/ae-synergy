-- 火力・被ダメの目安に使う想定ボスの能力と味方の装備の仮定（JSON。キーは src/models/estimate.ts の ENEMY_FIELDS）
ALTER TABLE parties ADD COLUMN enemy TEXT NOT NULL DEFAULT '{}';
