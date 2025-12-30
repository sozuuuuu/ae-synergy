class DraftPartyPost < ApplicationRecord
  belongs_to :user
  has_many :draft_party_memberships, dependent: :destroy
  has_many :characters, through: :draft_party_memberships
  has_many :draft_party_post_tags, dependent: :destroy
  has_many :use_case_tags, through: :draft_party_post_tags

  accepts_nested_attributes_for :draft_party_memberships, allow_destroy: true

  COMPOSITION_TYPES = ['full_party', 'synergy'].freeze

  validates :composition_type, inclusion: { in: COMPOSITION_TYPES }

  scope :full_parties, -> { where(composition_type: 'full_party') }
  scope :synergies, -> { where(composition_type: 'synergy') }

  def full_party?
    composition_type == 'full_party'
  end

  def synergy?
    composition_type == 'synergy'
  end

  def main_members
    draft_party_memberships.where(slot_type: 'main').order(:position)
  end

  def sub_members
    draft_party_memberships.where(slot_type: 'sub').order(:position)
  end

  # ドラフトから公開投稿に変換
  def publish!
    ActiveRecord::Base.transaction do
      party_post = PartyPost.new(
        user: user,
        title: title.presence || "無題の#{synergy? ? 'シナジー' : 'パーティー'}",
        description: description,
        strategy: strategy,
        composition_type: composition_type
      )

      # メンバーをコピー
      draft_party_memberships.each do |draft_membership|
        party_post.party_memberships.build(
          character: draft_membership.character,
          slot_type: draft_membership.slot_type,
          position: draft_membership.position
        )
      end

      # タグをコピー
      party_post.use_case_tag_ids = use_case_tag_ids

      # 保存（バリデーション実行）
      party_post.save!

      # ドラフトを削除
      destroy!

      party_post
    end
  end
end
