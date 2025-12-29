class CreateCharacterImages < ActiveRecord::Migration[8.1]
  def change
    create_table :character_images do |t|
      t.references :character, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.string :image_url, null: false
      t.boolean :approved, default: true, null: false

      t.timestamps
    end

    add_index :character_images, [:character_id, :approved]
    add_index :character_images, :created_at
  end
end
