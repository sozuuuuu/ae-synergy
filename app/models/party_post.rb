class PartyPost < ApplicationRecord
  has_paper_trail

  include Votable
  include Commentable

  belongs_to :user
  has_many :party_memberships, dependent: :destroy
  has_many :characters, through: :party_memberships
  has_many :party_post_tags, dependent: :destroy
  has_many :use_case_tags, through: :party_post_tags

  accepts_nested_attributes_for :party_memberships, allow_destroy: true

  COMPOSITION_TYPES = ['full_party', 'synergy'].freeze

  validates :title, presence: true, length: { maximum: 200 }
  validates :composition_type, inclusion: { in: COMPOSITION_TYPES }
  validate :correct_party_composition

  scope :full_parties, -> { where(composition_type: 'full_party') }
  scope :synergies, -> { where(composition_type: 'synergy') }
  scope :search, ->(query) {
    query.present? ? where("title ILIKE ? OR description ILIKE ?",
                          "%#{sanitize_sql_like(query)}%",
                          "%#{sanitize_sql_like(query)}%") : all
  }

  def full_party?
    composition_type == 'full_party'
  end

  def synergy?
    composition_type == 'synergy'
  end

  def main_members
    party_memberships.where(slot_type: 'main').order(:position)
  end

  def sub_members
    party_memberships.where(slot_type: 'sub').order(:position)
  end

  def all_ability_tags
    characters.flat_map(&:ability_tags).uniq.sort_by { |tag| [tag.category, tag.name] }
  end

  def ability_tags_by_category
    all_ability_tags.group_by(&:category)
  end

  private

  def correct_party_composition
    if full_party?
      main_count = party_memberships.select { |m| m.slot_type == 'main' && !m.marked_for_destruction? }.size
      sub_count = party_memberships.select { |m| m.slot_type == 'sub' && !m.marked_for_destruction? }.size

      errors.add(:base, "メインメンバーは4人必要です") unless main_count == 4
      errors.add(:base, "サブメンバーは2人必要です") unless sub_count == 2
    elsif synergy?
      synergy_count = party_memberships.select { |m| !m.marked_for_destruction? }.size
      errors.add(:base, "シナジーには最低2人のキャラクターが必要です") if synergy_count < 2
    end
  end
end
