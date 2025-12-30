require "application_system_test_case"

class PartyPostsTest < ApplicationSystemTestCase
  setup do
    @user = User.create!(
      username: "testuser",
      email: "test@example.com",
      password: "password123",
      password_confirmation: "password123"
    )
    @character1 = Character.first
    @character2 = Character.second
  end

  def login
    visit login_path
    fill_in "email", with: @user.email
    fill_in "password", with: "password123"
    click_on "ログイン", match: :first
  end

  test "シナジー一覧を表示" do
    synergy = PartyPost.create!(
      user: @user,
      title: "テストシナジー",
      description: "シナジーの説明",
      composition_type: "synergy",
      votes_count: 15
    )
    synergy.party_memberships.create!(character: @character1, slot_type: "synergy", position: 0)
    synergy.party_memberships.create!(character: @character2, slot_type: "synergy", position: 1)

    visit synergy_posts_path

    assert_text "シナジー投稿"
    assert_text "テストシナジー"
    assert_text "👍 15"
    assert_text @character1.name
    assert_text @character2.name
  end

  test "パーティ一覧を表示" do
    party = PartyPost.create!(
      user: @user,
      title: "テストパーティ",
      description: "パーティの説明",
      composition_type: "full_party",
      votes_count: 20
    )
    4.times do |i|
      char = Character.offset(i).first
      party.party_memberships.create!(character: char, slot_type: "main", position: i + 1)
    end
    2.times do |i|
      char = Character.offset(i + 4).first
      party.party_memberships.create!(character: char, slot_type: "sub", position: i + 1)
    end

    visit party_posts_path

    assert_text "パーティ編成投稿"
    assert_text "テストパーティ"
    assert_text "👍 20"
    assert_text "メインメンバー:"
    assert_text "サブメンバー:"
  end

  test "シナジー詳細を表示" do
    synergy = PartyPost.create!(
      user: @user,
      title: "詳細テストシナジー",
      description: "詳細な説明文",
      composition_type: "synergy",
      votes_count: 10
    )
    synergy.party_memberships.create!(character: @character1, slot_type: "synergy", position: 0)
    synergy.party_memberships.create!(character: @character2, slot_type: "synergy", position: 1)

    visit synergy_post_path(synergy)

    assert_text "詳細テストシナジー"
    assert_text "詳細な説明文"
    assert_text "キャラクター"
    assert_text @character1.name
    assert_text @character2.name
    assert_text "投稿者: #{@user.username}"

    # キャラクター画像カードが表示される
    assert_selector ".bg-blue-50.border-2.border-blue-200"
  end

  test "パーティ詳細を表示" do
    party = PartyPost.create!(
      user: @user,
      title: "詳細テストパーティ",
      description: "パーティ詳細説明",
      strategy: "戦略の説明",
      composition_type: "full_party"
    )
    4.times do |i|
      char = Character.offset(i).first
      party.party_memberships.create!(character: char, slot_type: "main", position: i + 1)
    end
    2.times do |i|
      char = Character.offset(i + 4).first
      party.party_memberships.create!(character: char, slot_type: "sub", position: i + 1)
    end

    visit party_post_path(party)

    assert_text "詳細テストパーティ"
    assert_text "パーティ詳細説明"
    assert_text "戦略の説明"
    assert_text "メインメンバー"
    assert_text "サブメンバー"

    # メイン・サブメンバーのカードが表示される
    assert_selector ".bg-indigo-50.border-2.border-indigo-200", count: 4
    assert_selector ".bg-purple-50.border-2.border-purple-200", count: 2
  end

  test "投票機能" do
    login

    synergy = PartyPost.create!(
      user: @user,
      title: "投票テスト",
      description: "説明",
      composition_type: "synergy",
      votes_count: 5
    )
    synergy.party_memberships.create!(character: @character1, slot_type: "synergy", position: 0)

    visit synergy_post_path(synergy)

    # 投票前の数
    assert_text "5"

    # Upvoteボタンをクリック
    within "[id^='votes_party_post_']" do
      click_on "👍"
    end

    # 投票数が増える
    assert_text "6"
  end

  test "キャラクターでフィルターされたシナジー一覧" do
    # character1を含むシナジー
    synergy1 = PartyPost.create!(
      user: @user,
      title: "シナジー1",
      description: "説明1",
      composition_type: "synergy"
    )
    synergy1.party_memberships.create!(character: @character1, slot_type: "synergy", position: 0)

    # character2を含むシナジー（表示されない）
    synergy2 = PartyPost.create!(
      user: @user,
      title: "シナジー2",
      description: "説明2",
      composition_type: "synergy"
    )
    synergy2.party_memberships.create!(character: @character2, slot_type: "synergy", position: 0)

    visit synergy_posts_path(character_id: @character1.id)

    assert_text "#{@character1.name}を使ったシナジー"
    assert_text "シナジー1"
    assert_no_text "シナジー2"

    # キャラクターページへのリンクが表示される
    assert_link "← #{@character1.name}のページに戻る"
  end

  test "一覧ページでキャラクター画像が表示される" do
    # 画像付きキャラクターを作成
    @character1.character_images.create!(
      user: @user,
      image_url: "https://example.com/char1.jpg"
    )

    synergy = PartyPost.create!(
      user: @user,
      title: "画像テストシナジー",
      description: "説明",
      composition_type: "synergy"
    )
    synergy.party_memberships.create!(character: @character1, slot_type: "synergy", position: 0)

    visit synergy_posts_path

    # キャラクター画像が表示される（32x32pxのカード）
    assert_selector "img[src='https://example.com/char1.jpg']"
    assert_selector ".w-8.h-8"  # 32x32pxのクラス
  end

  test "パーティ編成でメイン・サブが区別される" do
    party = PartyPost.create!(
      user: @user,
      title: "メインサブテスト",
      description: "説明",
      composition_type: "full_party"
    )

    main_chars = Character.limit(4)
    main_chars.each_with_index do |char, i|
      party.party_memberships.create!(character: char, slot_type: "main", position: i + 1)
    end

    sub_chars = Character.offset(4).limit(2)
    sub_chars.each_with_index do |char, i|
      party.party_memberships.create!(character: char, slot_type: "sub", position: i + 1)
    end

    visit party_posts_path

    # メイン・サブのラベルが表示される
    assert_text "メインメンバー:"
    assert_text "サブメンバー:"

    # それぞれのキャラクター数が正しい
    within ".bg-white.rounded-lg.shadow-md", text: "メインサブテスト" do
      # メイン: indigo色
      assert_selector ".bg-indigo-50", count: 4
      # サブ: purple色
      assert_selector ".bg-purple-50", count: 2
    end
  end

  test "能力タグがハイライトされる" do
    # 能力タグを持つキャラクターでパーティを作成
    ability_tag = AbilityTag.first
    @character1.ability_tags << ability_tag unless @character1.ability_tags.include?(ability_tag)

    party = PartyPost.create!(
      user: @user,
      title: "能力タグテスト",
      description: "説明",
      composition_type: "synergy"
    )
    party.party_memberships.create!(character: @character1, slot_type: "synergy", position: 0)

    visit party_post_path(party)

    assert_text "このシナジーの能力"
    assert_text "緑色のタグはこのシナジーが持っている能力です"

    # 緑色でハイライトされたタグがある
    assert_selector ".bg-green-100.text-green-800"
  end

  test "マイページから草案パーティに遷移してキャラクター選択が重複しない" do
    login

    # 草案パーティを作成
    draft = @user.draft_party_posts.create!(composition_type: 'synergy')

    # マイページから草案パーティ編集ページに遷移
    visit dashboard_path
    click_on "編集", match: :first

    # キャラクター追加ボタンが1回だけ表示されることを確認
    character = Character.first
    character_rows = all(".character-row[data-character-id='#{character.id}']")
    assert_equal 1, character_rows.count, "キャラクター行が重複しています"

    # キャラクターを追加
    within(".character-row[data-character-id='#{character.id}']") do
      click_on "追加"
    end

    # 選択されたキャラクターが1回だけ表示されることを確認
    selected_badges = all(".inline-flex.items-center.bg-indigo-100[data-character-id='#{character.id}']")
    assert_equal 1, selected_badges.count, "選択されたキャラクターバッジが重複しています"

    # もう一度同じキャラクターを追加しようとするとアラートが表示される
    accept_alert "#{character.name}は既に追加されています" do
      within(".character-row[data-character-id='#{character.id}']") do
        click_on "追加"
      end
    end
  end

  test "シナジー草案を公開できる" do
    login

    # シナジー草案を作成
    draft = @user.draft_party_posts.create!(
      composition_type: 'synergy',
      title: "テスト公開シナジー",
      description: "公開テスト用の説明"
    )
    draft.draft_party_memberships.create!(character: @character1, slot_type: 'synergy', position: 0)
    draft.draft_party_memberships.create!(character: @character2, slot_type: 'synergy', position: 1)

    # 編集ページに移動
    visit edit_draft_party_post_path(draft)

    # 公開ボタンをクリック
    click_on "公開する"

    # 公開成功メッセージを確認
    assert_text "シナジーを公開しました"
    assert_text "テスト公開シナジー"

    # 草案が削除されたことを確認
    assert_nil DraftPartyPost.find_by(id: draft.id)

    # 公開投稿が作成されたことを確認
    party_post = PartyPost.find_by(title: "テスト公開シナジー")
    assert_not_nil party_post
    assert_equal 2, party_post.characters.count
  end

  test "パーティ草案を公開できる" do
    login

    # パーティ草案を作成
    draft = @user.draft_party_posts.create!(
      composition_type: 'full_party',
      title: "テスト公開パーティ",
      description: "公開テスト用の説明",
      strategy: "戦略の説明"
    )

    # メインメンバー4人
    4.times do |i|
      char = Character.offset(i).first
      draft.draft_party_memberships.create!(character: char, slot_type: 'main', position: i)
    end

    # サブメンバー2人
    2.times do |i|
      char = Character.offset(i + 4).first
      draft.draft_party_memberships.create!(character: char, slot_type: 'sub', position: i)
    end

    # 編集ページに移動
    visit edit_draft_party_post_path(draft)

    # 公開ボタンをクリック
    click_on "公開する"

    # 公開成功メッセージを確認
    assert_text "パーティー編成を公開しました"
    assert_text "テスト公開パーティ"

    # 草案が削除されたことを確認
    assert_nil DraftPartyPost.find_by(id: draft.id)

    # 公開投稿が作成されたことを確認
    party_post = PartyPost.find_by(title: "テスト公開パーティ")
    assert_not_nil party_post
    assert_equal 6, party_post.characters.count
  end

  test "キャラクターが不足しているシナジーは公開できない" do
    login

    # シナジー草案を作成（キャラクター1人のみ）
    draft = @user.draft_party_posts.create!(
      composition_type: 'synergy',
      title: "不完全なシナジー"
    )
    draft.draft_party_memberships.create!(character: @character1, slot_type: 'synergy', position: 0)

    # 編集ページに移動
    visit edit_draft_party_post_path(draft)

    # 公開ボタンをクリック
    click_on "公開する"

    # エラーメッセージを確認
    assert_text "公開に失敗しました"
    assert_text "シナジーには最低2人のキャラクターが必要です"

    # 草案が削除されていないことを確認
    assert_not_nil DraftPartyPost.find_by(id: draft.id)
  end

  test "メインメンバーが不足しているパーティは公開できない" do
    login

    # パーティ草案を作成（メイン3人、サブ2人）
    draft = @user.draft_party_posts.create!(
      composition_type: 'full_party',
      title: "不完全なパーティ"
    )

    # メインメンバー3人（4人必要）
    3.times do |i|
      char = Character.offset(i).first
      draft.draft_party_memberships.create!(character: char, slot_type: 'main', position: i)
    end

    # サブメンバー2人
    2.times do |i|
      char = Character.offset(i + 3).first
      draft.draft_party_memberships.create!(character: char, slot_type: 'sub', position: i)
    end

    # 編集ページに移動
    visit edit_draft_party_post_path(draft)

    # 公開ボタンをクリック
    click_on "公開する"

    # エラーメッセージを確認
    assert_text "公開に失敗しました"
    assert_text "メインメンバーは4人必要です"

    # 草案が削除されていないことを確認
    assert_not_nil DraftPartyPost.find_by(id: draft.id)
  end

  test "タイトルがない草案も公開できる（自動で無題になる）" do
    login

    # タイトルなしのシナジー草案を作成
    draft = @user.draft_party_posts.create!(
      composition_type: 'synergy',
      description: "タイトルなしのテスト"
    )
    draft.draft_party_memberships.create!(character: @character1, slot_type: 'synergy', position: 0)
    draft.draft_party_memberships.create!(character: @character2, slot_type: 'synergy', position: 1)

    # 編集ページに移動
    visit edit_draft_party_post_path(draft)

    # 公開ボタンをクリック
    click_on "公開する"

    # 公開成功メッセージを確認
    assert_text "シナジーを公開しました"
    assert_text "無題のシナジー"

    # 公開投稿が作成されたことを確認
    party_post = PartyPost.find_by(title: "無題のシナジー")
    assert_not_nil party_post
  end
end
