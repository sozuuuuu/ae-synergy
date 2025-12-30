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

# シナジー作成用のキャラクター取得（存在しない場合はスキップするように堅牢化）
def get_char(objects, name)
  char = objects[name]
  puts "Warning: Character '#{name}' not found for synergy seeding" unless char
  char
end

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
      synergy = create_with_error_logging(PartyPost, { title: party_data['title'], composition_type: party_data['composition_type'] }) do |post|
        post.user = admin
        post.description = party_data['description']
        post.votes_count = votes
      end
      
      # キャラクターをシナジーに追加
      characters.each_with_index do |char, index|
        create_with_error_logging(PartyMembership, { 
          party_post: synergy, 
          character: char, 
          slot_type: "synergy", 
          position: index 
        })
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
  puts "synergy_parties.yml not found, skipping..."
  
  # 既存のハードコードされたシナジーデータ（フォールバック）
  aldo = get_char(character_objects, 'アルド')
  feinne = get_char(character_objects, 'フィーネ')
  aldo_as = get_char(character_objects, 'アルド(AS)') || get_char(character_objects, 'アルド（AS）')
  myunfa = get_char(character_objects, 'ミュンファ')
  shigure = get_char(character_objects, 'シグレ')

  # シナジー投稿の作成
  puts "Creating synergy posts (fallback)..."

  if aldo && aldo_as
    synergy1 = create_with_error_logging(PartyPost, { title: "火属性周回最強コンビ", composition_type: 'synergy' }) do |post|
      post.user = admin
      post.description = "アルドとアルド（AS）を組み合わせることで、火属性周回が非常に効率的になります。\n全体攻撃と単体攻撃を使い分けることで、あらゆる場面に対応可能。"
      post.votes_count = 25
    end
    create_with_error_logging(PartyMembership, { party_post: synergy1, character: aldo, slot_type: "synergy", position: 0 })
    create_with_error_logging(PartyMembership, { party_post: synergy1, character: aldo_as, slot_type: "synergy", position: 1 })
    synergy1.use_case_tags = [UseCaseTag.find_by(name: "周回"), UseCaseTag.find_by(name: "初心者向け")].compact
  end

  if myunfa && shigure
    synergy2 = create_with_error_logging(PartyPost, { title: "地水デバフコンボ", composition_type: 'synergy' }) do |post|
      post.user = admin
      post.description = "ミュンファの耐性バフとシグレの高火力を組み合わせた安定シナジー。\nミュンファで耐性を上げつつ、シグレで一気に削る戦法が強力。"
      post.votes_count = 18
    end
    create_with_error_logging(PartyMembership, { party_post: synergy2, character: myunfa, slot_type: "synergy", position: 0 })
    create_with_error_logging(PartyMembership, { party_post: synergy2, character: shigure, slot_type: "synergy", position: 1 })
    synergy2.use_case_tags = [UseCaseTag.find_by(name: "ボス戦"), UseCaseTag.find_by(name: "サポート")].compact
  end

  if feinne && aldo
    synergy3 = create_with_error_logging(PartyPost, { title: "ヒーラー＋火力アタッカー", composition_type: 'synergy' }) do |post|
      post.user = admin
      post.description = "フィーネの回復でパーティを支えつつ、アルドで火力を出す基本的なシナジー。\n初心者におすすめの組み合わせです。"
      post.votes_count = 32
    end
    create_with_error_logging(PartyMembership, { party_post: synergy3, character: feinne, slot_type: "synergy", position: 0 })
    create_with_error_logging(PartyMembership, { party_post: synergy3, character: aldo, slot_type: "synergy", position: 1 })
    synergy3.use_case_tags = [UseCaseTag.find_by(name: "初心者向け"), UseCaseTag.find_by(name: "ストーリー")].compact
  end

  puts "Created #{PartyPost.synergies.count} synergy posts"
end

# パーティ投稿の作成
puts "Creating party posts..."

aldo = get_char(character_objects, 'アルド')
feinne = get_char(character_objects, 'フィーネ')
aldo_as = get_char(character_objects, 'アルド(AS)') || get_char(character_objects, 'アルド（AS）')
myunfa = get_char(character_objects, 'ミュンファ')
shigure = get_char(character_objects, 'シグレ')

if aldo && feinne && myunfa && shigure && aldo_as
  party1 = create_with_error_logging(PartyPost, { title: "バランス型汎用パーティ", composition_type: 'full_party' }) do |post|
    post.user = admin
    post.description = "どんな場面でも対応できる汎用性の高いパーティ構成です。"
    post.strategy = "アルドで火力、フィーネで回復、ミュンファでサポート、シグレでサブアタッカー。\nサブにアルド（AS）を入れて属性の偏りに対応。"
    post.votes_count = 45
  end
  create_with_error_logging(PartyMembership, { party_post: party1, character: aldo, slot_type: "main", position: 1 })
  create_with_error_logging(PartyMembership, { party_post: party1, character: feinne, slot_type: "main", position: 2 })
  create_with_error_logging(PartyMembership, { party_post: party1, character: myunfa, slot_type: "main", position: 3 })
  create_with_error_logging(PartyMembership, { party_post: party1, character: shigure, slot_type: "main", position: 4 })
  create_with_error_logging(PartyMembership, { party_post: party1, character: aldo_as, slot_type: "sub", position: 1 })
  create_with_error_logging(PartyMembership, { party_post: party1, character: feinne, slot_type: "sub", position: 2 })
  party1.use_case_tags = [UseCaseTag.find_by(name: "ストーリー"), UseCaseTag.find_by(name: "初心者向け")].compact

  party2 = create_with_error_logging(PartyPost, { title: "火属性特化周回パーティ", composition_type: 'full_party' }) do |post|
    post.user = admin
    post.description = "火属性の敵に特化した高速周回用パーティです。"
    post.strategy = "アルドとアルド（AS）をメインに配置し、全体攻撃と単体攻撃を使い分け。\nフィーネの回復で安定性を確保しつつ、ミュンファのバフで火力を底上げ。"
    post.votes_count = 28
  end
  create_with_error_logging(PartyMembership, { party_post: party2, character: aldo, slot_type: "main", position: 1 })
  create_with_error_logging(PartyMembership, { party_post: party2, character: aldo_as, slot_type: "main", position: 2 })
  create_with_error_logging(PartyMembership, { party_post: party2, character: feinne, slot_type: "main", position: 3 })
  create_with_error_logging(PartyMembership, { party_post: party2, character: myunfa, slot_type: "main", position: 4 })
  create_with_error_logging(PartyMembership, { party_post: party2, character: shigure, slot_type: "sub", position: 1 })
  create_with_error_logging(PartyMembership, { party_post: party2, character: feinne, slot_type: "sub", position: 2 })
  party2.use_case_tags = [UseCaseTag.find_by(name: "周回"), UseCaseTag.find_by(name: "AF火力")].compact
end

puts "Created #{PartyPost.full_parties.count} party posts"

puts "Seed data creation completed!"
puts "---"
puts "Test user credentials:"
puts "Email: admin@example.com / user1@example.com / user2@example.com"
puts "Password: password123"
puts "(Development: Use dropdown in nav to switch users)"
