class CreateCharacterPersonalities < ActiveRecord::Migration[8.1]
  def change
    create_table :character_personalities do |t|
      t.references :character, null: false, foreign_key: true
      t.references :personality_tag, null: false, foreign_key: true

      t.timestamps
    end

    add_index :character_personalities, [:character_id, :personality_tag_id],
              unique: true, name: 'index_char_personalities_on_char_and_tag'
  end
end
