class CreateCharacters < ActiveRecord::Migration[8.1]
  def change
    create_table :characters do |t|
      t.string :name, null: false
      t.string :rarity, null: false
      t.string :element, null: false
      t.string :weapon_type, null: false
      t.string :light_shadow_type, null: false
      t.text :notes

      t.timestamps
    end

    add_index :characters, :name
    add_index :characters, :rarity
    add_index :characters, :element
    add_index :characters, :weapon_type
  end
end
