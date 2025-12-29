class User < ApplicationRecord
  has_secure_password

  has_many :party_posts, dependent: :destroy
  has_many :draft_party_posts, dependent: :destroy
  has_many :comments, dependent: :destroy
  has_many :votes, dependent: :destroy
  has_many :user_characters, dependent: :destroy
  has_many :owned_characters, through: :user_characters, source: :character
  has_many :character_images, dependent: :destroy
  has_many :user_favorite_character_images, dependent: :destroy
  has_many :character_image_likes, dependent: :destroy

  validates :username, presence: true, uniqueness: true, length: { in: 3..20 }
  validates :email, presence: true, uniqueness: true, format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :password, length: { minimum: 8 }, if: -> { password.present? }

  def owns_character?(character)
    user_characters.exists?(character_id: character.id)
  end
end
