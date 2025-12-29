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
end
