class PartyPostsController < ApplicationController
  skip_before_action :require_login, only: [:index, :show], raise: false
  before_action :require_login, only: [:new, :edit, :update, :destroy, :publish]
  before_action :set_composition_type, only: [:index, :new]
  before_action :set_party_post, only: [:show, :destroy], unless: -> { params[:draft].present? }
  before_action :authorize_user, only: [:destroy]

  def index
    @party_posts = PartyPost.includes(:characters, :use_case_tags, :user, :party_memberships)
                            .where(composition_type: @composition_type)

    # キャラクターでフィルター
    if params[:character_id].present?
      @character = Character.find(params[:character_id])
      @party_posts = @party_posts.joins(:party_memberships)
                                  .where(party_memberships: { character_id: params[:character_id] })
                                  .distinct
    end

    @party_posts = @party_posts.order(votes_count: :desc)
                                .page(params[:page])
  end

  def show
    @all_ability_tags_by_category = AbilityTag.all.group_by(&:category)
    @versions = @party_post.versions.order(created_at: :desc).limit(10)

    # OGP meta tags
    set_meta_tags(
      title: @party_post.title,
      description: @party_post.description.present? ? @party_post.description.truncate(200) : "アナザーエデンの#{@party_post.synergy? ? 'シナジー' : 'パーティー編成'}",
      og: {
        title: @party_post.title,
        description: @party_post.description.present? ? @party_post.description.truncate(200) : "アナザーエデンの#{@party_post.synergy? ? 'シナジー' : 'パーティー編成'}",
        url: @party_post.synergy? ? synergy_post_url(@party_post) : party_post_url(@party_post),
        image: @party_post.characters.first&.display_image_for&.present? ? @party_post.characters.first.display_image_for : nil
      },
      twitter: {
        title: @party_post.title,
        description: @party_post.description.present? ? @party_post.description.truncate(200) : "アナザーエデンの#{@party_post.synergy? ? 'シナジー' : 'パーティー編成'}",
        image: @party_post.characters.first&.display_image_for&.present? ? @party_post.characters.first.display_image_for : nil
      }
    )
  end

  def new
    # ドラフトを作成して編集画面にリダイレクト
    @draft = current_user.draft_party_posts.create!(composition_type: @composition_type)
    redirect_to edit_draft_party_post_path(@draft)
  end

  def edit
    # ドラフトを編集
    @draft = current_user.draft_party_posts.includes(draft_party_memberships: :character).find(params[:id])
    @characters = Character.includes(:ability_tags, :personality_tags).order(:name)
    @use_case_tags = UseCaseTag.all.order(:name)
    @ability_tags_by_category = AbilityTag.all.group_by(&:category)
    @all_ability_tags_by_category = AbilityTag.all.group_by(&:category)
    @personality_tags = PersonalityTag.all.order(:name)
  end

  def update
    # ドラフトを更新
    @draft = current_user.draft_party_posts.includes(draft_party_memberships: :character).find(params[:id])

    if @draft.update(draft_party_post_params)
      redirect_to edit_draft_party_post_path(@draft), notice: "保存しました"
    else
      @characters = Character.includes(:ability_tags, :personality_tags).order(:name)
      @use_case_tags = UseCaseTag.all.order(:name)
      @ability_tags_by_category = AbilityTag.all.group_by(&:category)
      @all_ability_tags_by_category = AbilityTag.all.group_by(&:category)
      @personality_tags = PersonalityTag.all.order(:name)
      render :edit, status: :unprocessable_entity
    end
  end

  def publish
    # ドラフトを公開投稿に変換
    @draft = current_user.draft_party_posts.find(params[:id])

    begin
      party_post = @draft.publish!
      # 公開後、作成した投稿の詳細ページへ
      redirect_path = party_post.synergy? ? synergy_post_path(party_post) : party_post_path(party_post)
      redirect_to redirect_path, notice: "#{party_post.synergy? ? 'シナジー' : 'パーティー編成'}を公開しました"
    rescue ActiveRecord::RecordInvalid => e
      @characters = Character.includes(:ability_tags, :personality_tags).order(:name)
      @use_case_tags = UseCaseTag.all.order(:name)
      @ability_tags_by_category = AbilityTag.all.group_by(&:category)
      @all_ability_tags_by_category = AbilityTag.all.group_by(&:category)
      @personality_tags = PersonalityTag.all.order(:name)
      flash.now[:alert] = "公開に失敗しました: #{e.message}"
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    if params[:draft]
      # ドラフトの削除
      @draft = current_user.draft_party_posts.find(params[:id])
      composition_type = @draft.composition_type
      @draft.destroy
    else
      # 公開投稿の削除
      composition_type = @party_post.composition_type
      @party_post.destroy
    end

    # マイページから来た場合はマイページに戻る、そうでなければ一覧へ
    redirect_path = if request.referer&.include?('dashboard')
                      dashboard_path
                    else
                      composition_type == 'synergy' ? synergy_posts_path : party_posts_path
                    end
    redirect_to redirect_path, notice: "#{composition_type == 'synergy' ? 'シナジー' : 'パーティー編成'}を削除しました"
  end

  private

  def set_composition_type
    @composition_type = params[:composition_type] || 'full_party'
  end

  def set_party_post
    @party_post = PartyPost.includes(:characters, :use_case_tags, :user, party_memberships: :character, comments: :user).find(params[:id])
  end

  def authorize_user
    post = params[:draft] ? current_user.draft_party_posts.find_by(id: params[:id]) : @party_post
    unless post && post.user == current_user
      redirect_to root_path, alert: "編集・削除権限がありません"
    end
  end

  def party_post_params
    params.require(:party_post).permit(
      :title, :description, :strategy, :composition_type,
      use_case_tag_ids: [],
      party_memberships_attributes: [:id, :character_id, :slot_type, :position, :_destroy]
    )
  end

  def draft_party_post_params
    params.require(:draft_party_post).permit(
      :title, :description, :strategy, :composition_type,
      use_case_tag_ids: [],
      draft_party_memberships_attributes: [:id, :character_id, :slot_type, :position, :_destroy]
    )
  end
end
