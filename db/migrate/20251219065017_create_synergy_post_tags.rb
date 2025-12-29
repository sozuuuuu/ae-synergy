class CreateSynergyPostTags < ActiveRecord::Migration[8.1]
  def change
    create_table :synergy_post_tags do |t|
      t.references :synergy_post, null: false, foreign_key: true
      t.references :use_case_tag, null: false, foreign_key: true

      t.timestamps
    end

    add_index :synergy_post_tags, [:synergy_post_id, :use_case_tag_id],
              unique: true, name: 'index_synergy_post_tags'
  end
end
