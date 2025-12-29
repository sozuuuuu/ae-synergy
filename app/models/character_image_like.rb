class CharacterImageLike < ApplicationRecord
  belongs_to :user
  belongs_to :character_image, counter_cache: :likes_count

  validates :user_id, uniqueness: { scope: :character_image_id }
end
