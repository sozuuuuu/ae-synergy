class CreateSynergyPostCharacters < ActiveRecord::Migration[8.1]
  def change
    create_table :synergy_post_characters do |t|
      t.references :synergy_post, null: false, foreign_key: true
      t.references :character, null: false, foreign_key: true

      t.timestamps
    end

    add_index :synergy_post_characters, [:synergy_post_id, :character_id],
              unique: true, name: 'index_synergy_posts_characters'
  end
end
