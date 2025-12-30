namespace :master_data do
  desc "Load master data from YAML files (production-ready with upsert)"
  task load: :environment do
    puts "=" * 80
    puts "Loading master data from YAML files..."
    puts "Environment: #{Rails.env}"
    puts "=" * 80

    # PersonalityTagsの読み込み
    load_personality_tags

    # UseCaseTagsの読み込み
    load_use_case_tags

    # AbilityTagsの読み込み
    load_ability_tags

    # Charactersの読み込み
    load_characters

    puts "=" * 80
    puts "Master data loading completed!"
    puts "=" * 80
  end

  desc "Load only personality tags"
  task load_personality_tags: :environment do
    load_personality_tags
  end

  desc "Load only use case tags"
  task load_use_case_tags: :environment do
    load_use_case_tags
  end

  desc "Load only ability tags"
  task load_ability_tags: :environment do
    load_ability_tags
  end

  desc "Load only characters"
  task load_characters: :environment do
    load_characters
  end

  private

  def load_personality_tags
    puts "\n--- Loading PersonalityTags ---"
    file_path = Rails.root.join('db', 'data', 'personality_tags.yml')

    unless File.exist?(file_path)
      puts "Warning: #{file_path} not found, skipping..."
      return
    end

    data = YAML.load_file(file_path)
    created_count = 0
    updated_count = 0

    ActiveRecord::Base.transaction do
      data['personality_tags'].each do |tag_data|
        name = tag_data.is_a?(Hash) ? tag_data['name'] : tag_data

        tag = PersonalityTag.find_or_initialize_by(name: name)

        if tag.new_record?
          tag.save!
          created_count += 1
          puts "  Created: #{name} (ID: #{tag.id})"
        else
          # 既存レコードは更新不要（nameのみなので）
          updated_count += 1
          puts "  Exists: #{name} (ID: #{tag.id})"
        end
      end
    end

    puts "PersonalityTags: #{created_count} created, #{updated_count} already exist"
    puts "Total PersonalityTags: #{PersonalityTag.count}"
  end

  def load_use_case_tags
    puts "\n--- Loading UseCaseTags ---"
    file_path = Rails.root.join('db', 'data', 'use_case_tags.yml')

    unless File.exist?(file_path)
      puts "Warning: #{file_path} not found, skipping..."
      return
    end

    data = YAML.load_file(file_path)
    created_count = 0
    updated_count = 0

    ActiveRecord::Base.transaction do
      data['use_case_tags'].each do |tag_data|
        name = tag_data.is_a?(Hash) ? tag_data['name'] : tag_data

        tag = UseCaseTag.find_or_initialize_by(name: name)

        if tag.new_record?
          tag.save!
          created_count += 1
          puts "  Created: #{name} (ID: #{tag.id})"
        else
          updated_count += 1
          puts "  Exists: #{name} (ID: #{tag.id})"
        end
      end
    end

    puts "UseCaseTags: #{created_count} created, #{updated_count} already exist"
    puts "Total UseCaseTags: #{UseCaseTag.count}"
  end

  def load_ability_tags
    puts "\n--- Loading AbilityTags ---"
    file_path = Rails.root.join('db', 'data', 'ability_tags.yml')

    unless File.exist?(file_path)
      puts "Warning: #{file_path} not found, skipping..."
      return
    end

    data = YAML.load_file(file_path)
    created_count = 0
    updated_count = 0

    ActiveRecord::Base.transaction do
      data['ability_tags'].each do |tag_data|
        tag = AbilityTag.find_or_initialize_by(name: tag_data['name'])

        # categoryを更新（既存の場合も）
        tag.category = tag_data['category'] || "特殊能力"

        if tag.changed?
          is_new = tag.new_record?
          tag.save!

          if is_new
            created_count += 1
            puts "  Created: #{tag.name} [#{tag.category}] (ID: #{tag.id})"
          else
            updated_count += 1
            puts "  Updated: #{tag.name} [#{tag.category}] (ID: #{tag.id})"
          end
        else
          puts "  Exists: #{tag.name} [#{tag.category}] (ID: #{tag.id})"
        end
      end
    end

    puts "AbilityTags: #{created_count} created, #{updated_count} updated"
    puts "Total AbilityTags: #{AbilityTag.count}"
  end

  def load_characters
    puts "\n--- Loading Characters ---"
    file_path = Rails.root.join('db', 'data', 'characters.yml')

    unless File.exist?(file_path)
      puts "Warning: #{file_path} not found, skipping..."
      return
    end

    data = YAML.load_file(file_path)
    created_count = 0
    updated_count = 0
    skipped_count = 0

    ActiveRecord::Base.transaction do
      data['characters'].each do |char_data|
        character = Character.find_or_initialize_by(name: char_data['name'])

        # 基本属性を設定
        character.rarity = char_data['rarity']
        character.element = char_data['element']
        character.weapon_type = char_data['weapon_type']
        character.light_shadow_type = char_data['light_shadow_type']
        character.notes = char_data['notes']
        character.image_url = char_data['image_url'] if char_data['image_url']

        is_new = character.new_record?

        begin
          if character.changed?
            character.save!

            if is_new
              created_count += 1
              puts "  Created: #{character.name} (ID: #{character.id})"
            else
              updated_count += 1
              puts "  Updated: #{character.name} (ID: #{character.id})"
            end
          else
            puts "  Exists: #{character.name} (ID: #{character.id})"
          end

          # PersonalityTagsの関連を更新
          if char_data['personality_tags']
            existing_tag_names = character.personality_tags.pluck(:name)
            new_tag_names = char_data['personality_tags']

            # 追加すべきタグ
            tags_to_add = new_tag_names - existing_tag_names
            tags_to_add.each do |tag_name|
              tag = PersonalityTag.find_by(name: tag_name)
              if tag
                character.personality_tags << tag
                puts "    Added personality tag: #{tag_name}"
              else
                puts "    Warning: PersonalityTag not found: #{tag_name}"
              end
            end

            # 削除すべきタグ（YAMLから削除されたタグ）
            tags_to_remove = existing_tag_names - new_tag_names
            tags_to_remove.each do |tag_name|
              tag = PersonalityTag.find_by(name: tag_name)
              if tag
                character.personality_tags.delete(tag)
                puts "    Removed personality tag: #{tag_name}"
              end
            end
          end

          # AbilityTagsの関連を更新
          if char_data['ability_tags']
            existing_tag_names = character.ability_tags.pluck(:name)
            new_tag_names = char_data['ability_tags']

            # 追加すべきタグ
            tags_to_add = new_tag_names - existing_tag_names
            tags_to_add.each do |tag_name|
              tag = AbilityTag.find_by(name: tag_name)
              if tag
                character.ability_tags << tag
                puts "    Added ability tag: #{tag_name}"
              else
                puts "    Warning: AbilityTag not found: #{tag_name}"
              end
            end

            # 削除すべきタグ（YAMLから削除されたタグ）
            tags_to_remove = existing_tag_names - new_tag_names
            tags_to_remove.each do |tag_name|
              tag = AbilityTag.find_by(name: tag_name)
              if tag
                character.ability_tags.delete(tag)
                puts "    Removed ability tag: #{tag_name}"
              end
            end
          end
        rescue ActiveRecord::RecordInvalid => e
          skipped_count += 1
          puts "  Error: Failed to save #{char_data['name']}"
          puts "    #{e.message}"
          puts "    Errors: #{e.record.errors.full_messages.join(', ')}"
        end
      end
    end

    puts "Characters: #{created_count} created, #{updated_count} updated, #{skipped_count} skipped"
    puts "Total Characters: #{Character.count}"
  end
end
