class CreateVotes < ActiveRecord::Migration[8.1]
  def change
    create_table :votes do |t|
      t.references :user, null: false, foreign_key: true
      t.references :votable, polymorphic: true, null: false
      t.integer :value, null: false

      t.timestamps
    end

    add_index :votes, [:user_id, :votable_type, :votable_id],
              unique: true, name: 'index_votes_unique_per_user'
    add_index :votes, [:votable_type, :votable_id]
  end
end
