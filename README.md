# AE Synergy

アナザーエデンのパーティを、好きなキャラから組み立てるための一人用ツール。

アタッカー（★）を決めると、その攻撃属性・攻撃種から火力の別枠（耐性DOWN・属性攻撃UP・武器種バフ・心技一体や下克上などの特殊バフ・ZONE・オーバークリティカル など）を割り出し、
耐久（回復・バリア・耐性UP・挑発）や想定ボスへの必須能力（状態異常無効・吹き飛ばし無効・ブレイクなど）と合わせて、
どの枠が埋まっているかを表示する。足りない枠からは、その枠を埋められるキャラを候補として出し、そのまま編成に加えられる。

- ✓ そのまま効く / △ 条件付き・本人のみ・位置次第 / ✗ 未充足
- 発動条件のうち、位置（前衛・後衛・両隣）・人数（パーソナリティ・天冥・性別・武器）・ZONE は今の編成で判定する。
  満たしていれば ✓、満たさなければキャラ名に ✗ を付けて枠は埋めない。蓄積・HP・ターン数など戦闘の流れ次第の条件は △ のまま。
  条件は anaden-mcp が構造化したもの（`_condition.clauses`）だけを読み、自由文は解釈しない
- 候補の「＋」は、そのキャラを入れると同時に埋まるほかの枠
- 共通パーソナリティ（2人以上）も表示する（天冥アビリティやグラスタの条件確認用）

## 構成

- [Bun](https://bun.sh) + [Elysia](https://elysiajs.com)（サーバー側で JSX を HTML にして返す。文字列は自前のランタイムで必ずエスケープ）
- `bun:sqlite`（`migrations/*.sql` を起動時に適用）
- Tailwind CSS v4

認証はない。tailnet 内での個人利用を前提にしており、他サイトからの POST は Origin で拒否する。

## セットアップ

```bash
bun install
bun run dev                    # http://127.0.0.1:3000
```

キャラデータはリポジトリに含めていない。正は anaden-mcp（private）で、anaden-gear のデータに発動条件の構造化を足した
`~/.cache/anaden-mcp/characters.enriched.json` を取り込む（場所は `ANADEN_DATA` で変更可）。anaden-gear から直接は取り込まない。

- このファイルは anaden-mcp がキャラデータを更新したときと、`anaden export` を実行したときに書き出される
- DB が空のまま起動すると自動で取り込む。データを更新するときは `bun run import:characters`（差分だけ反映）
- 条件の辞書（anaden-mcp の `data/conditions.json`）を直したら、`anaden export` → `bun run import:characters`

## コマンド

| コマンド | 内容 |
|---|---|
| `bun run dev` | 開発サーバー（ファイル変更で再起動・CSS 監視） |
| `bun run start` | CSS をビルドして起動 |
| `bun test` | テスト |
| `bun run typecheck` | 型チェック |

環境変数: `PORT`（既定 3000）、`HOST`（既定 127.0.0.1）、`DATABASE_PATH`（既定 `storage/ae-synergy.sqlite3`）、
`PUBLIC_ORIGIN`（リバースプロキシ越しの公開 URL。Origin 検査に使う）

## 枠の判定

`src/models/requirements.ts` にルールがある。取り込み時にキャラの効果を「種別・対象・数値・条件・出典」の行に分解して
`character_effects` に保存し、判定は実行時にこのルールで行うので、ルールを変えても再取り込みは不要。
