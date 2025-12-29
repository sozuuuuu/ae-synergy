# テストガイド

このプロジェクトでは、主要な機能をCapybaraシステムテストでカバーしています。

## テスト実行前の準備

```bash
# テストデータベースを準備
rails db:test:prepare

# テストデータをシード
RAILS_ENV=test rails db:seed
```

## テストの実行

```bash
# すべてのシステムテストを実行
rails test:system

# 特定のテストファイルを実行
rails test:system test/system/authentications_test.rb
rails test:system test/system/characters_test.rb
rails test:system test/system/party_posts_test.rb

# ヘッドレスではなくブラウザで実行（デバッグ用）
# application_system_test_case.rbのusing: :headless_chromeをusing: :chromeに変更
```

## テストカバレッジ

### 認証テスト (`test/system/authentications_test.rb`)
- ログイン・ログアウト
- ログイン後のリダイレクト（元のページに戻る）
- 認証エラーハンドリング

### キャラクターテスト (`test/system/characters_test.rb`)
- キャラクター一覧・詳細表示
- キャラクター所持トグル
- 画像アップロード（モーダル表示）
- 画像お気に入り設定
- 画像いいね機能（Turbo Stream）
- 人気のシナジー・パーティ表示
- もっと見るリンク→フィルターされた一覧へ遷移
- キャラクター画像カード表示

### シナジー/パーティ投稿テスト (`test/system/party_posts_test.rb`)
- シナジー・パーティ一覧表示
- 詳細ページ表示
- 投票機能（votes_countの増減）
- キャラクターでフィルターされた一覧
- 一覧・詳細でのキャラクター画像表示
- メイン/サブメンバーの色分け
- 能力タグのハイライト表示

## テストの重要ポイント

### 1. いいね機能のTurbo Stream
いいねボタンをクリックすると、ページリロードなしでいいね数とボタン状態が更新されます。

```ruby
# いいねボタンをクリック
within "#like_button" do
  click_on "🤍 いいね"
end

# Turbo Streamで更新される
assert_text "❤️ 1"
within "#like_button" do
  assert_button "❤️ いいね済み"
end
```

### 2. 投票機能のカウンター保持
シードデータで設定されたvotes_countが、投票時に正しく加算されることを確認します。

```ruby
# シードデータでvotes_count = 5
synergy = PartyPost.create!(votes_count: 5, ...)

# Upvote → 6になる（1に戻らない）
click_on "👍"
assert_text "6"
```

### 3. キャラクター画像の表示
各ページで適切なサイズのキャラクター画像が表示されることを確認します。

- 詳細ページ: 64x64px (w-16 h-16)
- 一覧ページ: 32x32px (w-8 h-8)
- キャラクター詳細の人気セクション: 24x24px (w-6 h-6)

### 4. キャラクターフィルター
キャラクター詳細ページの「もっと見る」から、そのキャラクターを使った投稿のみを表示します。

```ruby
visit synergy_posts_path(character_id: @character.id)
assert_text "#{@character.name}を使ったシナジー"
```

## トラブルシューティング

### システムテストが実行されない
- `test/test_helper.rb`で`fixtures :all`がコメントアウトされているか確認
- シードデータがテストDBに入っているか確認: `RAILS_ENV=test rails db:seed`

### Chromeドライバーのエラー
```bash
# Chromeドライバーを更新
brew install --cask chromedriver
```

### Turbo Streamのテストが失敗する
- Turbo FrameのIDが正しいか確認
- `using_session`を使って複数ユーザーのテストを分離

## 今後のテスト追加項目

- [ ] ファイルアップロードの完全なテスト
- [ ] コメント機能のテスト
- [ ] ドラフト投稿のテスト
- [ ] バージョン履歴のテスト
- [ ] 検索機能のテスト
- [ ] ページネーションのテスト
