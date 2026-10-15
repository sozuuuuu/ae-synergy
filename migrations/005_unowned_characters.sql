-- 持っていないキャラ（自動編成の候補から外す）。新しく実装されたキャラは持っている扱いにしたいので、持っていない方を記録する
CREATE TABLE unowned_characters (
  character_id INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE
);
