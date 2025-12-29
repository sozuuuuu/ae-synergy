class CreatePartyMemberships < ActiveRecord::Migration[8.1]
  def change
    create_table :party_memberships do |t|
      t.references :party_post, null: false, foreign_key: true
      t.references :character, null: false, foreign_key: true
      t.string :slot_type, null: false
      t.integer :position, null: false

      t.timestamps
    end

    add_index :party_memberships, [:party_post_id, :slot_type, :position],
              unique: true, name: 'index_party_memberships_unique'
  end
end
