class CreateDraftPartyMemberships < ActiveRecord::Migration[8.1]
  def change
    create_table :draft_party_memberships do |t|
      t.references :draft_party_post, null: false, foreign_key: true
      t.references :character, null: false, foreign_key: true
      t.string :slot_type
      t.integer :position

      t.timestamps
    end

    add_index :draft_party_memberships, [:draft_party_post_id, :character_id], unique: true, name: 'index_draft_memberships_on_post_and_character'
  end
end
