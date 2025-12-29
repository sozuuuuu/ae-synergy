class UserCharacter < ApplicationRecord
  belongs_to :user
  belongs_to :character

  validates :user_id, uniqueness: { scope: :character_id }
end
