class UnifySynergyAndPartyPosts < ActiveRecord::Migration[8.1]
  def up
    # Add composition_type to party_posts
    add_column :party_posts, :composition_type, :string, default: 'full_party', null: false
    add_index :party_posts, :composition_type

    # Add temporary column to track old synergy_post_id
    add_column :party_posts, :old_synergy_id, :integer

    # Migrate synergy_posts to party_posts
    execute <<-SQL
      INSERT INTO party_posts (user_id, title, description, votes_count, comments_count, composition_type, old_synergy_id, created_at, updated_at)
      SELECT user_id, title, description, votes_count, comments_count, 'synergy', id, created_at, updated_at
      FROM synergy_posts
    SQL

    # Migrate synergy_post_characters to party_memberships using old_synergy_id
    execute <<-SQL
      INSERT INTO party_memberships (party_post_id, character_id, slot_type, position, created_at, updated_at)
      SELECT pp.id, spc.character_id, 'synergy',
             ROW_NUMBER() OVER (PARTITION BY spc.synergy_post_id ORDER BY spc.id) - 1,
             NOW(), NOW()
      FROM synergy_post_characters spc
      JOIN party_posts pp ON pp.old_synergy_id = spc.synergy_post_id
      WHERE pp.composition_type = 'synergy'
    SQL

    # Migrate synergy_post_tags to party_post_tags using old_synergy_id
    execute <<-SQL
      INSERT INTO party_post_tags (party_post_id, use_case_tag_id, created_at, updated_at)
      SELECT pp.id, spt.use_case_tag_id, NOW(), NOW()
      FROM synergy_post_tags spt
      JOIN party_posts pp ON pp.old_synergy_id = spt.synergy_post_id
      WHERE pp.composition_type = 'synergy'
    SQL

    # Migrate comments from synergy_posts to party_posts
    execute <<-SQL
      UPDATE comments c
      SET commentable_id = pp.id
      FROM party_posts pp
      WHERE c.commentable_type = 'SynergyPost'
        AND c.commentable_id = pp.old_synergy_id
        AND pp.composition_type = 'synergy'
    SQL

    # Migrate votes from synergy_posts to party_posts
    execute <<-SQL
      UPDATE votes v
      SET votable_id = pp.id
      FROM party_posts pp
      WHERE v.votable_type = 'SynergyPost'
        AND v.votable_id = pp.old_synergy_id
        AND pp.composition_type = 'synergy'
    SQL

    # Update polymorphic types
    execute "UPDATE comments SET commentable_type = 'PartyPost' WHERE commentable_type = 'SynergyPost'"
    execute "UPDATE votes SET votable_type = 'PartyPost' WHERE votable_type = 'SynergyPost'"

    # Remove temporary column
    remove_column :party_posts, :old_synergy_id

    # Drop old tables
    drop_table :synergy_post_tags
    drop_table :synergy_post_characters
    drop_table :synergy_posts
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Cannot reverse this migration safely"
  end
end
