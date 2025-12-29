# This file should ensure the existence of records required to run the application in every environment (production,
# development, test). The code here should be idempotent so that it can be executed at any point in every environment.
# The data can then be loaded with the bin/rails db:seed command (or created alongside the database with db:setup).

puts "Seeding database..."

# テストユーザーの作成
puts "Creating test users..."
admin = User.find_or_create_by!(email: "admin@example.com") do |user|
  user.username = "admin"
  user.password = "password123"
  user.password_confirmation = "password123"
  user.admin = true
end
puts "Created admin user: #{admin.username} (admin: #{admin.admin})"

user1 = User.find_or_create_by!(email: "user1@example.com") do |user|
  user.username = "user1"
  user.password = "password123"
  user.password_confirmation = "password123"
end
puts "Created user1: #{user1.username}"

user2 = User.find_or_create_by!(email: "user2@example.com") do |user|
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
  PersonalityTag.find_or_create_by!(name: name)
end
puts "Created #{PersonalityTag.count} personality tags"

# ユースケースタグの作成（YAMLから読み込み）
puts "Loading use case tags from YAML..."
use_case_tags_data = YAML.load_file(Rails.root.join('db', 'data', 'use_case_tags.yml'))
use_case_tags_data['use_case_tags'].each do |tag_data|
  name = tag_data.is_a?(Hash) ? tag_data['name'] : tag_data
  UseCaseTag.find_or_create_by!(name: name)
end
puts "Created #{UseCaseTag.count} use case tags"

# 能力タグの作成（YAMLから読み込み）
puts "Loading ability tags from YAML..."
ability_tags_data = YAML.load_file(Rails.root.join('db', 'data', 'ability_tags.yml'))
ability_tags_data['ability_tags'].each do |tag_data|
  AbilityTag.find_or_create_by!(name: tag_data['name']) do |tag|
    tag.category = tag_data['category']
  end
end
puts "Created #{AbilityTag.count} ability tags"

# YAMLからキャラクターデータを読み込み
puts "Loading characters from YAML..."
characters_data = YAML.load_file(Rails.root.join('db', 'data', 'characters.yml'))

character_objects = {}

characters_data['characters'].each do |char_data|
  character = Character.find_or_create_by!(name: char_data['name']) do |char|
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
      character.personality_tags << tag unless character.personality_tags.include?(tag)
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

# 変数を保持（シナジー/パーティ作成用）
aldo = character_objects['アルド']
feinne = character_objects['フィーネ']
aldo_as = character_objects['アルド（AS）']
myunfa = character_objects['ミュンファ']
shigure = character_objects['シグレ']

# シナジー投稿の作成
puts "Creating synergy posts..."

synergy1 = PartyPost.find_or_create_by!(title: "火属性周回最強コンビ", composition_type: 'synergy') do |post|
  post.user = admin
  post.description = "アルドとアルド（AS）を組み合わせることで、火属性周回が非常に効率的になります。\n全体攻撃と単体攻撃を使い分けることで、あらゆる場面に対応可能。"
  post.votes_count = 25
end
# シナジーのメンバー追加
PartyMembership.find_or_create_by!(party_post: synergy1, character: aldo) do |m|
  m.slot_type = "synergy"
  m.position = 0
end
PartyMembership.find_or_create_by!(party_post: synergy1, character: aldo_as) do |m|
  m.slot_type = "synergy"
  m.position = 1
end
synergy1.use_case_tags = [UseCaseTag.find_by(name: "周回"), UseCaseTag.find_by(name: "初心者向け")]

synergy2 = PartyPost.find_or_create_by!(title: "地水デバフコンボ", composition_type: 'synergy') do |post|
  post.user = admin
  post.description = "ミュンファの耐性バフとシグレの高火力を組み合わせた安定シナジー。\nミュンファで耐性を上げつつ、シグレで一気に削る戦法が強力。"
  post.votes_count = 18
end
PartyMembership.find_or_create_by!(party_post: synergy2, character: myunfa) do |m|
  m.slot_type = "synergy"
  m.position = 0
end
PartyMembership.find_or_create_by!(party_post: synergy2, character: shigure) do |m|
  m.slot_type = "synergy"
  m.position = 1
end
synergy2.use_case_tags = [UseCaseTag.find_by(name: "ボス戦"), UseCaseTag.find_by(name: "サポート")]

synergy3 = PartyPost.find_or_create_by!(title: "ヒーラー＋火力アタッカー", composition_type: 'synergy') do |post|
  post.user = admin
  post.description = "フィーネの回復でパーティを支えつつ、アルドで火力を出す基本的なシナジー。\n初心者におすすめの組み合わせです。"
  post.votes_count = 32
end
PartyMembership.find_or_create_by!(party_post: synergy3, character: feinne) do |m|
  m.slot_type = "synergy"
  m.position = 0
end
PartyMembership.find_or_create_by!(party_post: synergy3, character: aldo) do |m|
  m.slot_type = "synergy"
  m.position = 1
end
synergy3.use_case_tags = [UseCaseTag.find_by(name: "初心者向け"), UseCaseTag.find_by(name: "ストーリー")]

puts "Created #{PartyPost.synergies.count} synergy posts"

# パーティ投稿の作成
puts "Creating party posts..."

party1 = PartyPost.find_or_create_by!(title: "バランス型汎用パーティ", composition_type: 'full_party') do |post|
  post.user = admin
  post.description = "どんな場面でも対応できる汎用性の高いパーティ構成です。"
  post.strategy = "アルドで火力、フィーネで回復、ミュンファでサポート、シグレでサブアタッカー。\nサブにアルド（AS）を入れて属性の偏りに対応。"
  post.votes_count = 45
end
PartyMembership.find_or_create_by!(party_post: party1, character: aldo) do |m|
  m.slot_type = "main"
  m.position = 1
end
PartyMembership.find_or_create_by!(party_post: party1, character: feinne) do |m|
  m.slot_type = "main"
  m.position = 2
end
PartyMembership.find_or_create_by!(party_post: party1, character: myunfa) do |m|
  m.slot_type = "main"
  m.position = 3
end
PartyMembership.find_or_create_by!(party_post: party1, character: shigure) do |m|
  m.slot_type = "main"
  m.position = 4
end
PartyMembership.find_or_create_by!(party_post: party1, character: aldo_as) do |m|
  m.slot_type = "sub"
  m.position = 1
end
PartyMembership.find_or_create_by!(party_post: party1, character: feinne) do |m|
  m.slot_type = "sub"
  m.position = 2
end
party1.use_case_tags = [UseCaseTag.find_by(name: "ストーリー"), UseCaseTag.find_by(name: "初心者向け")]

party2 = PartyPost.find_or_create_by!(title: "火属性特化周回パーティ", composition_type: 'full_party') do |post|
  post.user = admin
  post.description = "火属性の敵に特化した高速周回用パーティです。"
  post.strategy = "アルドとアルド（AS）をメインに配置し、全体攻撃と単体攻撃を使い分け。\nフィーネの回復で安定性を確保しつつ、ミュンファのバフで火力を底上げ。"
  post.votes_count = 28
end
PartyMembership.find_or_create_by!(party_post: party2, character: aldo) do |m|
  m.slot_type = "main"
  m.position = 1
end
PartyMembership.find_or_create_by!(party_post: party2, character: aldo_as) do |m|
  m.slot_type = "main"
  m.position = 2
end
PartyMembership.find_or_create_by!(party_post: party2, character: feinne) do |m|
  m.slot_type = "main"
  m.position = 3
end
PartyMembership.find_or_create_by!(party_post: party2, character: myunfa) do |m|
  m.slot_type = "main"
  m.position = 4
end
PartyMembership.find_or_create_by!(party_post: party2, character: shigure) do |m|
  m.slot_type = "sub"
  m.position = 1
end
PartyMembership.find_or_create_by!(party_post: party2, character: feinne) do |m|
  m.slot_type = "sub"
  m.position = 2
end
party2.use_case_tags = [UseCaseTag.find_by(name: "周回"), UseCaseTag.find_by(name: "AF火力")]

puts "Created #{PartyPost.full_parties.count} party posts"

puts "Seed data creation completed!"
puts "---"
puts "Test user credentials:"
puts "Email: admin@example.com / user1@example.com / user2@example.com"
puts "Password: password123"
puts "(Development: Use dropdown in nav to switch users)"
