class CreateCharacterAbilities < ActiveRecord::Migration[8.1]
  def change
    create_table :character_abilities do |t|
      t.references :character, null: false, foreign_key: true
      t.references :ability_tag, null: false, foreign_key: true

      t.timestamps
    end
  end
end
