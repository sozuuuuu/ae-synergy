class PersonalityTag < ApplicationRecord
  has_many :character_personalities, dependent: :destroy
  has_many :characters, through: :character_personalities

  validates :name, presence: true, uniqueness: true
end
