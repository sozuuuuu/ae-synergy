class CreateDraftPartyPosts < ActiveRecord::Migration[8.1]
  def change
    create_table :draft_party_posts do |t|
      t.references :user, null: false, foreign_key: true
      t.string :title
      t.text :description
      t.text :strategy
      t.string :composition_type, null: false

      t.timestamps
    end

    add_index :draft_party_posts, :composition_type
    add_index :draft_party_posts, [:user_id, :composition_type]
  end
end
