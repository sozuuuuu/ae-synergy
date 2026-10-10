-- 一覧を五十音順に並べるためのキー（読みをひらがなにしたもの。取り込み時に作る）
ALTER TABLE characters ADD COLUMN sort_key TEXT NOT NULL DEFAULT '';
