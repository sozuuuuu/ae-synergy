module Votable
  extend ActiveSupport::Concern

  included do
    has_many :votes, as: :votable, dependent: :destroy

    def upvote_by(user)
      vote = votes.find_or_initialize_by(user: user)
      old_value = vote.persisted? ? vote.value : 0
      vote.value = 1
      vote.save!

      # 差分を計算して加算
      diff = 1 - old_value
      increment!(:votes_count, diff)
    end

    def downvote_by(user)
      vote = votes.find_or_initialize_by(user: user)
      old_value = vote.persisted? ? vote.value : 0
      vote.value = -1
      vote.save!

      # 差分を計算して加算
      diff = -1 - old_value
      increment!(:votes_count, diff)
    end

    def total_votes
      votes.sum(:value)
    end

    def user_vote(user)
      votes.find_by(user: user)
    end
  end
end
