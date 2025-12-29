class DashboardController < ApplicationController
  before_action :require_login

  def index
    @draft_synergies = current_user.draft_party_posts.synergies.order(updated_at: :desc)
    @draft_parties = current_user.draft_party_posts.full_parties.order(updated_at: :desc)
    @character_images = current_user.character_images.includes(:character).order(created_at: :desc)
  end
end
