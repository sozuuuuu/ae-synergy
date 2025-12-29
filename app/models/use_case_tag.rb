class UseCaseTag < ApplicationRecord
  has_many :synergy_post_tags, dependent: :destroy
  has_many :synergy_posts, through: :synergy_post_tags
  has_many :party_post_tags, dependent: :destroy
  has_many :party_posts, through: :party_post_tags

  validates :name, presence: true, uniqueness: true
end
