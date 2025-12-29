class CharacterPersonality < ApplicationRecord
  belongs_to :character
  belongs_to :personality_tag
end
