class CreatePersonalityTags < ActiveRecord::Migration[8.1]
  def change
    create_table :personality_tags do |t|
      t.string :name

      t.timestamps
    end
    add_index :personality_tags, :name, unique: true
  end
end
