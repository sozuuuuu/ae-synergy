class CommentsController < ApplicationController
  before_action :require_login

  def create
    commentable = find_commentable
    @comment = commentable.comments.build(comment_params)
    @comment.user = current_user

    if @comment.save
      respond_to do |format|
        format.turbo_stream do
          render turbo_stream: [
            turbo_stream.append(
              dom_id_for_comments(commentable),
              partial: 'comments/comment',
              locals: { comment: @comment }
            ),
            turbo_stream.replace(
              "#{dom_id_for_comments(commentable)}_form",
              partial: 'comments/form',
              locals: { commentable: commentable }
            )
          ]
        end
        format.html { redirect_back(fallback_location: root_path, notice: 'コメントを投稿しました') }
      end
    else
      respond_to do |format|
        format.turbo_stream do
          render turbo_stream: turbo_stream.replace(
            "#{dom_id_for_comments(commentable)}_form",
            partial: 'comments/form',
            locals: { commentable: commentable, comment: @comment }
          )
        end
        format.html { redirect_back(fallback_location: root_path, alert: 'コメントの投稿に失敗しました') }
      end
    end
  end

  def destroy
    @comment = Comment.find(params[:id])
    commentable = @comment.commentable

    if @comment.user == current_user
      @comment.destroy
      respond_to do |format|
        format.turbo_stream do
          render turbo_stream: turbo_stream.remove(@comment)
        end
        format.html { redirect_back(fallback_location: root_path, notice: 'コメントを削除しました') }
      end
    else
      redirect_back(fallback_location: root_path, alert: '権限がありません')
    end
  end

  private

  def find_commentable
    if params[:synergy_post_id]
      SynergyPost.find(params[:synergy_post_id])
    elsif params[:party_post_id]
      PartyPost.find(params[:party_post_id])
    end
  end

  def comment_params
    params.require(:comment).permit(:body)
  end

  def dom_id_for_comments(commentable)
    "comments_#{commentable.class.name.underscore}_#{commentable.id}"
  end
end
