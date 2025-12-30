class CharactersController < ApplicationController
  skip_before_action :require_login, only: [:index, :show, :search], raise: false
  before_action :set_character, only: [:show]
  before_action :require_login, only: [:toggle_ownership, :batch_add_ownership, :batch_remove_ownership]

  def index
    @characters = Character.includes(:personality_tags, :ability_tags)

    # 所持キャラフィルター
    if logged_in?
      show_only_owned = params[:show_only_owned] == '1'
      @characters = @characters.where(id: current_user.owned_characters.ids) if show_only_owned
      @show_only_owned = show_only_owned
      @owned_character_ids = current_user.owned_characters.ids
    end

    @characters = @characters.order(:name).page(params[:page])
    @ability_tags_by_category = AbilityTag.all.group_by(&:category)
  end

  def show
    @popular_synergies = @character.party_posts.synergies.order(votes_count: :desc).limit(5)
    @popular_parties = @character.party_posts.full_parties.order(votes_count: :desc).limit(5)

    # OGP meta tags
    description = "#{@character.name}（#{@character.element}・#{@character.weapon_type}）の詳細情報とシナジー・パーティー編成"
    set_meta_tags(
      title: @character.name,
      description: description,
      og: {
        title: @character.name,
        description: description,
        url: character_url(@character),
        image: @character.display_image_for&.present? ? @character.display_image_for : nil
      },
      twitter: {
        title: @character.name,
        description: description,
        image: @character.display_image_for&.present? ? @character.display_image_for : nil
      }
    )
  end

  def search
    @characters = Character.includes(:personality_tags, :ability_tags)
                          .search(params[:query])
                          .by_element(params[:element])
                          .by_weapon(params[:weapon])
                          .by_personalities(params[:personalities]&.split(','))
                          .by_abilities(params[:abilities]&.split(','))

    # 所持キャラフィルター
    if logged_in?
      show_only_owned = params[:show_only_owned] == '1'
      @characters = @characters.where(id: current_user.owned_characters.ids) if show_only_owned
      @show_only_owned = show_only_owned
      @owned_character_ids = current_user.owned_characters.ids
    end

    @characters = @characters.order(:name).limit(50)

    respond_to do |format|
      format.turbo_stream
      format.html { render :index }
    end
  end

  def toggle_ownership
    @character = Character.find(params[:id])
    user_character = current_user.user_characters.find_by(character: @character)

    if user_character
      user_character.destroy
      @owned = false
    else
      current_user.user_characters.create(character: @character)
      @owned = true
    end

    respond_to do |format|
      format.turbo_stream do
        render turbo_stream: turbo_stream.replace(
          "character_#{@character.id}_ownership",
          partial: 'characters/ownership_button',
          locals: { character: @character, owned: @owned }
        )
      end
      format.html { redirect_back(fallback_location: characters_path) }
    end
  end

  def batch_add_ownership
    character_ids = params[:character_ids] || []
    character_ids.each do |character_id|
      character = Character.find_by(id: character_id)
      next unless character
      current_user.user_characters.find_or_create_by(character: character)
    end

    # 元のフィルタ状態を保持してリダイレクト
    redirect_to_with_filter("#{character_ids.size}件のキャラクターを所持に追加しました")
  end

  def batch_remove_ownership
    character_ids = params[:character_ids] || []
    current_user.user_characters.where(character_id: character_ids).destroy_all

    # 元のフィルタ状態を保持してリダイレクト
    redirect_to_with_filter("#{character_ids.size}件のキャラクターを所持から削除しました")
  end

  private

  def set_character
    @character = Character.find(params[:id])
  end

  def redirect_to_with_filter(notice_message)
    # リファラーURLからパラメータを取得
    referer_uri = URI.parse(request.referer || characters_path)
    referer_params = Rack::Utils.parse_query(referer_uri.query)

    # show_only_ownedパラメータを保持（デフォルトは0にして所持フィルタを外す）
    show_only_owned = referer_params['show_only_owned'] || '0'

    redirect_to characters_path(show_only_owned: show_only_owned), notice: notice_message
  end
end
