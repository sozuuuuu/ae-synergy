class CreateSkills < ActiveRecord::Migration[8.1]
  def change
    create_table :skills do |t|
      t.references :character, null: false, foreign_key: true
      t.string :name, null: false
      t.text :effects
      t.integer :mp_cost
      t.integer :position

      t.timestamps
    end

    add_index :skills, [:character_id, :position]
  end
end
