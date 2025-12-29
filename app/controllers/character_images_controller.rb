class CharacterImagesController < ApplicationController
  before_action :require_login
  before_action :set_character
  before_action :set_character_image, only: [:destroy, :set_favorite, :like, :unlike]

  def create
    @character_image = @character.character_images.build(character_image_params)
    @character_image.user = current_user

    if @character_image.save
      redirect_to @character, notice: "画像を投稿しました"
    else
      redirect_to @character, alert: "画像の投稿に失敗しました: #{@character_image.errors.full_messages.join(', ')}"
    end
  end

  def destroy
    if @character_image.user == current_user || current_user.admin?
      @character_image.destroy
      redirect_to @character, notice: "画像を削除しました"
    else
      redirect_to @character, alert: "削除権限がありません"
    end
  end

  def set_favorite
    # 既存のお気に入りを削除
    current_user.user_favorite_character_images.where(character: @character).destroy_all

    # 新しいお気に入りを設定
    favorite = current_user.user_favorite_character_images.create(
      character: @character,
      character_image: @character_image
    )

    if favorite.persisted?
      redirect_to @character, notice: "お気に入り画像を設定しました"
    else
      redirect_to @character, alert: "お気に入り設定に失敗しました"
    end
  end

  def unset_favorite
    current_user.user_favorite_character_images.where(character: @character).destroy_all
    redirect_to @character, notice: "お気に入り画像を解除しました"
  end

  def like
    like = current_user.character_image_likes.find_by(character_image: @character_image)

    if like
      # 既にいいねしている場合は削除（トグル動作）
      like.destroy
      user_liked = false
    else
      # いいねしていない場合は追加
      current_user.character_image_likes.create(character_image: @character_image)
      user_liked = true
    end

    # いいね数を再取得
    @character_image.reload

    respond_to do |format|
      format.turbo_stream do
        render turbo_stream: [
          turbo_stream.replace("like_button", partial: "character_images/like_button", locals: { character: @character, character_image: @character_image, user_liked: user_liked }),
          turbo_stream.replace("likes_count", partial: "character_images/likes_count", locals: { character_image: @character_image })
        ]
      end
      format.html { redirect_to @character, notice: user_liked ? "いいねしました" : "いいねを解除しました" }
    end
  end

  def unlike
    like = current_user.character_image_likes.find_by(character_image: @character_image)

    if like
      like.destroy
      redirect_to @character, notice: "いいねを解除しました"
    else
      redirect_to @character, alert: "いいねしていません"
    end
  end

  private

  def set_character
    @character = Character.find(params[:character_id])
  end

  def set_character_image
    @character_image = @character.character_images.find(params[:id])
  end

  def character_image_params
    params.require(:character_image).permit(:image, :image_url)
  end
end
