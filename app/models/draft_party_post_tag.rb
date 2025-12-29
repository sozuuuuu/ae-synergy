class DraftPartyPostTag < ApplicationRecord
  belongs_to :draft_party_post
  belongs_to :use_case_tag

  validates :use_case_tag_id, uniqueness: { scope: :draft_party_post_id }
end
