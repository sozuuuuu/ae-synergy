# AE Synergy

アナザーエデンのパーティを、好きなキャラから組み立てるための一人用ツール。

アタッカー（★）を決めると、その攻撃属性・攻撃種から火力の別枠（耐性DOWN・属性攻撃UP・武器種バフ・特殊バフ・ZONE など）を割り出し、
耐久（回復・バリア・耐性UP・挑発）や想定ボスへの必須能力（状態異常無効・吹き飛ばし無効・ブレイクなど）と合わせて、
どの枠が埋まっているかを表示する。足りない枠からは、その枠を埋められるキャラを候補として出し、そのまま編成に加えられる。

- ✓ そのまま効く / △ 条件付き・本人のみ・位置次第 / ✗ 未充足
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
echo "CHARACTER_SOURCE=<取り込み元の URL>" > .env
bun run import:characters      # キャラデータを取り込む（再実行で差分更新）
bun run dev                    # http://127.0.0.1:3000
```

`import:characters` には URL のほか、ローカルの JSON ファイルのパスも渡せる。

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
