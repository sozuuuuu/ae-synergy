class Character < ApplicationRecord
  has_many :character_personalities, dependent: :destroy
  has_many :personality_tags, through: :character_personalities
  has_many :character_abilities, dependent: :destroy
  has_many :ability_tags, through: :character_abilities
  has_many :party_memberships, dependent: :destroy
  has_many :party_posts, through: :party_memberships
  has_many :character_images, dependent: :destroy
  has_many :user_favorite_character_images, dependent: :destroy

  RARITIES = ["☆4", "☆5", "AS", "ES", "Alter"].freeze
  ELEMENTS = ["Fire", "Water", "Earth", "Wind", "Thunder", "Shade", "Crystal", "None"].freeze
  WEAPON_TYPES = ["Sword", "Katana", "Axe", "Lance", "Bow", "Staff", "Fists", "Hammer"].freeze
  LIGHT_SHADOW_TYPES = ["Light", "Shadow"].freeze

  validates :name, presence: true
  validates :rarity, presence: true, inclusion: { in: RARITIES }
  validates :element, presence: true, inclusion: { in: ELEMENTS }
  validates :weapon_type, presence: true, inclusion: { in: WEAPON_TYPES }
  validates :light_shadow_type, presence: true, inclusion: { in: LIGHT_SHADOW_TYPES }

  scope :search, ->(query) { query.present? ? where("name ILIKE ?", "%#{sanitize_sql_like(query)}%") : all }
  scope :by_element, ->(element) { element.present? ? where(element: element) : all }
  scope :by_weapon, ->(weapon) { weapon.present? ? where(weapon_type: weapon) : all }
  scope :by_personalities, ->(tag_ids) { tag_ids.present? ? joins(:personality_tags).where(personality_tags: { id: tag_ids }).distinct : all }
  scope :by_abilities, ->(tag_ids) { tag_ids.present? ? joins(:ability_tags).where(ability_tags: { id: tag_ids }).distinct : all }

  # ユーザーごとに表示する画像を取得
  def display_image_for(user = nil)
    # ユーザーがログインしていて、お気に入り画像を設定している場合
    if user
      favorite = user_favorite_character_images.find_by(user: user)
      return favorite.character_image.display_url if favorite
    end

    # お気に入りがない場合、承認済み画像からランダムに1つ
    approved_images = character_images.approved
    return approved_images.sample&.display_url if approved_images.exists?

    # 画像がない場合はimage_urlフィールドの値（後方互換性）
    image_url
  end
end
