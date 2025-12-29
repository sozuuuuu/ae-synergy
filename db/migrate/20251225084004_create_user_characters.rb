class CreateUserCharacters < ActiveRecord::Migration[8.1]
  def change
    create_table :user_characters do |t|
      t.references :user, null: false, foreign_key: true
      t.references :character, null: false, foreign_key: true

      t.timestamps
    end

    add_index :user_characters, [:user_id, :character_id], unique: true
  end
end
