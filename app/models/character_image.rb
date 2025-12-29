class CharacterImage < ApplicationRecord
  belongs_to :character
  belongs_to :user
  has_many :user_favorite_character_images, dependent: :destroy
  has_many :character_image_likes, dependent: :destroy
  has_one_attached :image

  validates :image, presence: true, if: -> { image_url.blank? }
  validates :image_url, format: { with: URI::DEFAULT_PARSER.make_regexp(%w[http https]) }, allow_blank: true

  validate :image_or_url_present

  scope :approved, -> { where(approved: true) }

  def display_url
    if image.attached?
      Rails.application.routes.url_helpers.rails_blob_url(image, only_path: true)
    else
      image_url
    end
  end

  private

  def image_or_url_present
    if image_url.blank? && !image.attached?
      errors.add(:base, "画像ファイルまたは画像URLのいずれかが必要です")
    end
  end
end
