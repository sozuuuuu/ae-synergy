class CreateCharacterImageLikes < ActiveRecord::Migration[8.1]
  def change
    create_table :character_image_likes do |t|
      t.references :user, null: false, foreign_key: true
      t.references :character_image, null: false, foreign_key: true

      t.timestamps
    end

    add_index :character_image_likes, [:user_id, :character_image_id], unique: true, name: 'index_character_image_likes_on_user_and_image'
  end
end
