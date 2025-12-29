class PartyMembership < ApplicationRecord
  belongs_to :party_post
  belongs_to :character

  SLOT_TYPES = ['main', 'sub', 'synergy'].freeze

  validates :slot_type, presence: true, inclusion: { in: SLOT_TYPES }
  validates :position, presence: true, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
  validates :position, numericality: { less_than_or_equal_to: 4 }, if: -> { slot_type == 'main' }
  validates :position, numericality: { less_than_or_equal_to: 2 }, if: -> { slot_type == 'sub' }
end
