class CreateUserFavoriteCharacterImages < ActiveRecord::Migration[8.1]
  def change
    create_table :user_favorite_character_images do |t|
      t.references :user, null: false, foreign_key: true
      t.references :character, null: false, foreign_key: true
      t.references :character_image, null: false, foreign_key: true

      t.timestamps
    end

    add_index :user_favorite_character_images, [:user_id, :character_id], unique: true, name: 'index_user_favorite_images_on_user_and_character'
  end
end
