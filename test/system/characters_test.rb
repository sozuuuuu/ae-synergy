require "application_system_test_case"

class CharactersTest < ApplicationSystemTestCase
  setup do
    @user = User.create!(
      username: "testuser",
      email: "test@example.com",
      password: "password123",
      password_confirmation: "password123"
    )
    @character = Character.first
  end

  def login
    visit login_path
    fill_in "email", with: @user.email
    fill_in "password", with: "password123"
    click_on "ログイン", match: :first
  end

  test "キャラクター一覧を表示" do
    visit characters_path
    assert_text "キャラクター"
    assert_selector ".characters-grid"
  end

  test "キャラクター詳細を表示" do
    visit character_path(@character)
    assert_text @character.name
    assert_text "基本情報"
    assert_text @character.element
    assert_text @character.weapon_type
  end

  test "キャラクター所持トグル" do
    login
    visit character_path(@character)

    click_on "所持に追加"
    assert_text "所持から削除"

    click_on "所持から削除"
    assert_text "所持に追加"
  end

  test "画像アップロード" do
    login
    visit character_path(@character)

    # アップロードボタンが表示される
    assert_text "アップロード"

    # TODO: 実際のファイルアップロードテスト
    # モーダルが開くことを確認
    click_on "アップロード"
    assert_selector "[data-image-modal-target='modal']"
  end

  test "画像お気に入り設定" do
    login

    # テスト画像を作成
    image = @character.character_images.create!(
      user: @user,
      image_url: "https://example.com/test.jpg"
    )

    visit character_path(@character)

    # お気に入りボタンが表示される
    within "[data-image-gallery-target='favoriteButton']" do
      assert_button "☆ お気に入りに設定"
      click_on "☆ お気に入りに設定"
    end

    # ページリロード後もお気に入りが維持される
    visit character_path(@character)
    within "[data-image-gallery-target='favoriteButton']" do
      assert_button "★ お気に入り中"
    end
  end

  test "画像いいね機能" do
    login

    # テスト画像を作成
    image = @character.character_images.create!(
      user: @user,
      image_url: "https://example.com/test.jpg"
    )

    visit character_path(@character)

    # いいね数が0
    assert_text "❤️ 0"

    # いいねボタンをクリック
    within "#like_button" do
      click_on "🤍 いいね"
    end

    # いいね数が1になる（Turbo Streamで更新）
    assert_text "❤️ 1"
    within "#like_button" do
      assert_button "❤️ いいね済み"
    end
  end

  test "人気のシナジー表示" do
    # シナジー投稿を作成
    synergy = PartyPost.create!(
      user: @user,
      title: "テストシナジー",
      description: "テスト説明",
      composition_type: "synergy",
      votes_count: 10
    )
    synergy.party_memberships.create!(character: @character, slot_type: "synergy", position: 0)

    visit character_path(@character)

    assert_text "人気のシナジー"
    assert_text "テストシナジー"
    assert_text "👍 10"
  end

  test "人気のシナジーからもっと見る" do
    # 複数のシナジー投稿を作成
    6.times do |i|
      synergy = PartyPost.create!(
        user: @user,
        title: "シナジー#{i + 1}",
        description: "説明#{i + 1}",
        composition_type: "synergy",
        votes_count: i
      )
      synergy.party_memberships.create!(character: @character, slot_type: "synergy", position: 0)
    end

    visit character_path(@character)

    # もっと見るリンクが表示される
    within ".bg-white.rounded-lg.shadow-md", text: "人気のシナジー" do
      click_on "もっと見る →"
    end

    # シナジー一覧ページに遷移
    assert_text "#{@character.name}を使ったシナジー"
    assert_current_path synergy_posts_path(character_id: @character.id)
  end

  test "人気のパーティ編成からもっと見る" do
    # パーティ投稿を作成
    party = PartyPost.create!(
      user: @user,
      title: "テストパーティ",
      description: "説明",
      composition_type: "full_party",
      votes_count: 5
    )
    party.party_memberships.create!(character: @character, slot_type: "main", position: 1)

    visit character_path(@character)

    # もっと見るリンクが表示される
    within ".bg-white.rounded-lg.shadow-md", text: "人気のパーティ編成" do
      click_on "もっと見る →"
    end

    # パーティ一覧ページに遷移
    assert_text "#{@character.name}を使ったパーティ編成"
    assert_current_path party_posts_path(character_id: @character.id)
  end

  test "キャラクター画像がカードに表示される" do
    # テスト画像を作成
    image = @character.character_images.create!(
      user: @user,
      image_url: "https://example.com/test.jpg"
    )

    visit character_path(@character)

    # メイン画像が表示される
    assert_selector "img[data-image-gallery-target='mainImage']"

    # サムネイルが表示される
    assert_selector "img[src='https://example.com/test.jpg']", count: 2  # メイン + サムネ
  end
end
