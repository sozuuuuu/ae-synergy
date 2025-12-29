class CreateAbilityTags < ActiveRecord::Migration[8.1]
  def change
    create_table :ability_tags do |t|
      t.string :name, null: false
      t.string :category, null: false

      t.timestamps
    end

    add_index :ability_tags, :name, unique: true
    add_index :ability_tags, :category
  end
end
