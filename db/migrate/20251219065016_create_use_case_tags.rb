class CreateUseCaseTags < ActiveRecord::Migration[8.1]
  def change
    create_table :use_case_tags do |t|
      t.string :name

      t.timestamps
    end
    add_index :use_case_tags, :name, unique: true
  end
end
