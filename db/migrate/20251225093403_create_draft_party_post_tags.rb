class CreateDraftPartyPostTags < ActiveRecord::Migration[8.1]
  def change
    create_table :draft_party_post_tags do |t|
      t.references :draft_party_post, null: false, foreign_key: true
      t.references :use_case_tag, null: false, foreign_key: true

      t.timestamps
    end

    add_index :draft_party_post_tags, [:draft_party_post_id, :use_case_tag_id], unique: true, name: 'index_draft_post_tags_on_post_and_tag'
  end
end
