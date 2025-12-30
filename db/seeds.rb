# This file should ensure the existence of records required to run the application in every environment (production,
# development, test). The code here should be idempotent so that it can be executed at any point in every environment.
# The data can then be loaded with the bin/rails db:seed command (or created alongside the database with db:setup).

def create_with_error_logging(model, attributes, &block)
  model.find_or_create_by!(attributes, &block)
rescue ActiveRecord::RecordInvalid => e
  puts "Error creating #{model.name}: #{e.message}"
  puts "Attributes: #{attributes}"
  puts "Errors: #{e.record.errors.full_messages.join(', ')}"
  raise e
end

puts "Seeding database..."

# テストユーザーの作成
puts "Creating test users..."
admin = create_with_error_logging(User, { email: "admin@example.com" }) do |user|
  user.username = "admin"
  user.password = "password123"
  user.password_confirmation = "password123"
  user.admin = true
end
puts "Created admin user: #{admin.username} (admin: #{admin.admin})"

user1 = create_with_error_logging(User, { email: "user1@example.com" }) do |user|
  user.username = "user1"
  user.password = "password123"
  user.password_confirmation = "password123"
end
puts "Created user1: #{user1.username}"

user2 = create_with_error_logging(User, { email: "user2@example.com" }) do |user|
  user.username = "user2"
  user.password = "password123"
  user.password_confirmation = "password123"
end
puts "Created user2: #{user2.username}"

# パーソナリティタグの作成（YAMLから読み込み）
puts "Loading personality tags from YAML..."
personality_tags_data = YAML.load_file(Rails.root.join('db', 'data', 'personality_tags.yml'))
personality_tags_data['personality_tags'].each do |tag_data|
  name = tag_data.is_a?(Hash) ? tag_data['name'] : tag_data
  create_with_error_logging(PersonalityTag, { name: name })
end
puts "Created #{PersonalityTag.count} personality tags"

# ユースケースタグの作成（YAMLから読み込み）
puts "Loading use case tags from YAML..."
use_case_tags_data = YAML.load_file(Rails.root.join('db', 'data', 'use_case_tags.yml'))
use_case_tags_data['use_case_tags'].each do |tag_data|
  name = tag_data.is_a?(Hash) ? tag_data['name'] : tag_data
  create_with_error_logging(UseCaseTag, { name: name })
end
puts "Created #{UseCaseTag.count} use case tags"

# 能力タグの作成（YAMLから読み込み）
puts "Loading ability tags from YAML..."
ability_tags_data = YAML.load_file(Rails.root.join('db', 'data', 'ability_tags.yml'))
ability_tags_data['ability_tags'].each do |tag_data|
  create_with_error_logging(AbilityTag, { name: tag_data['name'] }) do |tag|
    tag.category = tag_data['category'] || "特殊能力"
  end
end
puts "Created #{AbilityTag.count} ability tags"

# YAMLからキャラクターデータを読み込み
puts "Loading characters from YAML..."
characters_data = YAML.load_file(Rails.root.join('db', 'data', 'characters.yml'))

character_objects = {}

characters_data['characters'].each do |char_data|
  character = create_with_error_logging(Character, { name: char_data['name'] }) do |char|
    char.rarity = char_data['rarity']
    char.element = char_data['element']
    char.weapon_type = char_data['weapon_type']
    char.light_shadow_type = char_data['light_shadow_type']
    char.notes = char_data['notes']
    char.image_url = char_data['image_url']
  end

  # パーソナリティタグの追加
  if char_data['personality_tags']
    char_data['personality_tags'].each do |tag_name|
      tag = PersonalityTag.find_by(name: tag_name)
      character.personality_tags << tag if tag && !character.personality_tags.include?(tag)
    end
  end

  # 能力タグの追加
  if char_data['ability_tags']
    char_data['ability_tags'].each do |tag_name|
      tag = AbilityTag.find_by(name: tag_name)
      character.ability_tags << tag if tag && !character.ability_tags.include?(tag)
    end
  end

  # シナジー/パーティ作成用に保存
  character_objects[char_data['name']] = character
end

puts "Created #{Character.count} characters"

# ===== YAMLからシナジー・パーティデータを読み込み =====
puts "Loading synergy parties from YAML..."
synergy_parties_file = Rails.root.join('db', 'data', 'synergy_parties.yml')

if File.exist?(synergy_parties_file)
  synergy_parties_data = YAML.load_file(synergy_parties_file)
  
  synergy_parties_data['synergy_parties'].each do |party_data|
    # キャラクターの存在確認
    characters = party_data['characters'].map { |name| character_objects[name] }.compact

    if characters.length < 2
      puts "Skipping '#{party_data['title']}': Not enough characters found (need at least 2)"
      next
    end

    # ランダムな投票数を生成（10〜50の範囲）
    votes = rand(10..50)

    begin
      # PartyMembershipsを含めてPartyPostを作成
      party_memberships_attributes = characters.each_with_index.map do |char, index|
        {
          character: char,
          slot_type: "synergy",
          position: index
        }
      end

      synergy = create_with_error_logging(PartyPost, { title: party_data['title'], composition_type: party_data['composition_type'] }) do |post|
        post.user = admin
        post.description = party_data['description']
        post.votes_count = votes
        post.party_memberships.build(party_memberships_attributes)
      end

      # ユースケースタグの追加
      if party_data['use_case_tags']
        tags = party_data['use_case_tags'].map { |name| UseCaseTag.find_by(name: name) }.compact
        synergy.use_case_tags = tags
      end

      puts "Created synergy: #{party_data['title']} (#{characters.length} characters)"
    rescue => e
      puts "Error creating synergy '#{party_data['title']}': #{e.message}"
    end
  end
  
  puts "Created #{PartyPost.synergies.count} synergy posts from YAML"
else
  puts "synergy_parties.yml not found, skipping synergy creation..."
end

puts "Seed data creation completed!"
puts "---"
puts "Test user credentials:"
puts "Email: admin@example.com / user1@example.com / user2@example.com"
puts "Password: password123"
puts "(Development: Use dropdown in nav to switch users)"
