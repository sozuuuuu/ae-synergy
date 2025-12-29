class UserFavoriteCharacterImage < ApplicationRecord
  belongs_to :user
  belongs_to :character
  belongs_to :character_image

  validates :user_id, uniqueness: { scope: :character_id }
  validate :character_image_belongs_to_character

  private

  def character_image_belongs_to_character
    if character_image && character_image.character_id != character_id
      errors.add(:character_image, "must belong to the specified character")
    end
  end
end
