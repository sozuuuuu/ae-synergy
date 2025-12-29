class CreatePartyPostTags < ActiveRecord::Migration[8.1]
  def change
    create_table :party_post_tags do |t|
      t.references :party_post, null: false, foreign_key: true
      t.references :use_case_tag, null: false, foreign_key: true

      t.timestamps
    end

    add_index :party_post_tags, [:party_post_id, :use_case_tag_id],
              unique: true, name: 'index_party_post_tags'
  end
end
