class AbilityTag < ApplicationRecord
  has_many :character_abilities, dependent: :destroy
  has_many :characters, through: :character_abilities

  validates :name, presence: true, uniqueness: true
  validates :category, presence: true

  CATEGORIES = [
    "ゾーン",
    "バフ・デバフ",
    "状態異常",
    "守護・庇い立て",
    "特殊能力",
    "武器種バフ"
  ].freeze

  validates :category, inclusion: { in: CATEGORIES }
end
