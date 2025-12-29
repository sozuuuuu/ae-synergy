require "application_system_test_case"

class AuthenticationsTest < ApplicationSystemTestCase
  setup do
    @user = User.create!(
      username: "testuser",
      email: "test@example.com",
      password: "password123",
      password_confirmation: "password123"
    )
  end

  test "ログインとログアウト" do
    visit root_path
    assert_text "ログイン"

    click_on "ログイン"
    fill_in "email", with: @user.email
    fill_in "password", with: "password123"
    click_on "ログイン", match: :first

    assert_text "ようこそ、#{@user.username}さん"
    assert_text "ログアウト"

    click_on "ログアウト"
    assert_text "ログイン"
    assert_no_text "ようこそ、#{@user.username}さん"
  end

  test "ログイン後に元のページに戻る" do
    character = Character.first

    visit character_path(character)
    click_on "アップロード"

    # ログインページにリダイレクト
    assert_text "ログインが必要です"

    fill_in "email", with: @user.email
    fill_in "password", with: "password123"
    click_on "ログイン", match: :first

    # キャラクターページに戻る
    assert_current_path character_path(character)
  end

  test "間違ったパスワードでログイン失敗" do
    visit login_path
    fill_in "email", with: @user.email
    fill_in "password", with: "wrongpassword"
    click_on "ログイン", match: :first

    assert_text "メールアドレスまたはパスワードが正しくありません"
    assert_no_text "ようこそ、#{@user.username}さん"
  end
end
