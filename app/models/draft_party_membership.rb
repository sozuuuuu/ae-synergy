class DraftPartyMembership < ApplicationRecord
  belongs_to :draft_party_post
  belongs_to :character

  validates :character_id, uniqueness: { scope: :draft_party_post_id }
end
