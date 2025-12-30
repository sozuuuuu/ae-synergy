class VotesController < ApplicationController
  before_action :require_login

  def create
    votable = find_votable

    if params[:value] == 'up'
      votable.upvote_by(current_user)
    end

    respond_to do |format|
      format.turbo_stream do
        render turbo_stream: turbo_stream.replace(
          dom_id_for_votes(votable),
          partial: 'votes/buttons',
          locals: { votable: votable }
        )
      end
      format.html { redirect_back(fallback_location: root_path) }
    end
  end

  private

  def find_votable
    votable_type = params[:votable_type].constantize
    votable_type.find(params[:votable_id])
  end

  def dom_id_for_votes(votable)
    "votes_#{votable.class.name.underscore}_#{votable.id}"
  end
end
