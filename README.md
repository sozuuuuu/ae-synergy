# AE Synergy

アナザーエデンのキャラクターシナジー共有サイト

## 機能

- **キャラクターWiki**: キャラクター情報の管理・検索
- **リアルタイム検索**: 属性・武器種・パーソナリティでフィルタリング
- **シナジー投稿**: 2人以上のキャラクターの組み合わせを共有
- **パーティ編成投稿**: 6人編成（メイン4+サブ2）を共有
- **投票・コメント**: 投稿への評価とディスカッション
- **バージョン履歴**: キャラクター情報の編集履歴（PaperTrail）

## セットアップ

### 必要要件

- Ruby 3.2.8
- PostgreSQL 14+
- Node.js 18+

### インストール

```bash
# リポジトリのクローン
git clone https://github.com/yourusername/ae-synergy.git
cd ae-synergy

# 依存関係のインストール
bundle install

# データベースの作成・マイグレーション
rails db:create
rails db:migrate

# 初期データの投入
rails db:seed

# サーバーの起動
rails server
```

### テストユーザー

- メール: `admin@example.com`
- パスワード: `password123`

## キャラクターデータの管理

キャラクター情報は `db/data/characters.yml` で管理されています。

### 新しいキャラクターの追加

`db/data/characters.yml` を編集して、以下の形式でキャラクターを追加します：

```yaml
characters:
  - name: キャラクター名
    rarity: ☆5  # ☆4, ☆5, AS, ES, Alter
    element: Fire  # Fire, Water, Earth, Wind, Thunder, Shade, Crystal, None
    weapon_type: Sword  # Sword, Katana, Axe, Lance, Bow, Staff, Fists, Hammer
    light_shadow_type: Light  # Light, Shadow
    notes: キャラクターの説明
    image_url: https://example.com/image.jpg
    personality_tags:
      - 人間
      - IDA学園
    skills:
      - name: スキル名
        effects: スキルの効果
        mp_cost: 50
        position: 1
```

### データの反映

YAMLファイルを編集した後、以下のコマンドでデータベースに反映します：

```bash
rails db:seed
```

全データをリセットして再投入する場合：

```bash
rails db:seed:replant
```

## 技術スタック

- **フレームワーク**: Ruby on Rails 8.1.1
- **データベース**: PostgreSQL
- **フロントエンド**: Hotwire (Turbo + Stimulus), Tailwind CSS
- **認証**: has_secure_password
- **バージョン管理**: PaperTrail
- **ページネーション**: Kaminari

## ライセンス

MIT
