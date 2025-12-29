class PartyPostTag < ApplicationRecord
  belongs_to :party_post
  belongs_to :use_case_tag
end
