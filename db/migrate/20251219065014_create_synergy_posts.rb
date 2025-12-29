class CreateSynergyPosts < ActiveRecord::Migration[8.1]
  def change
    create_table :synergy_posts do |t|
      t.references :user, null: false, foreign_key: true
      t.string :title, null: false
      t.text :description, null: false
      t.integer :votes_count, default: 0, null: false
      t.integer :comments_count, default: 0, null: false

      t.timestamps
    end

    add_index :synergy_posts, :created_at
    add_index :synergy_posts, :votes_count
  end
end
