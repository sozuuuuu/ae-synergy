# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2025_12_26_075336) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "ability_tags", force: :cascade do |t|
    t.string "category", null: false
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.datetime "updated_at", null: false
    t.index ["category"], name: "index_ability_tags_on_category"
    t.index ["name"], name: "index_ability_tags_on_name", unique: true
  end

  create_table "active_storage_attachments", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.bigint "record_id", null: false
    t.string "record_type", null: false
    t.index ["blob_id"], name: "index_active_storage_attachments_on_blob_id"
    t.index ["record_type", "record_id", "name", "blob_id"], name: "index_active_storage_attachments_uniqueness", unique: true
  end

  create_table "active_storage_blobs", force: :cascade do |t|
    t.bigint "byte_size", null: false
    t.string "checksum"
    t.string "content_type"
    t.datetime "created_at", null: false
    t.string "filename", null: false
    t.string "key", null: false
    t.text "metadata"
    t.string "service_name", null: false
    t.index ["key"], name: "index_active_storage_blobs_on_key", unique: true
  end

  create_table "active_storage_variant_records", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.string "variation_digest", null: false
    t.index ["blob_id", "variation_digest"], name: "index_active_storage_variant_records_uniqueness", unique: true
  end

  create_table "character_abilities", force: :cascade do |t|
    t.bigint "ability_tag_id", null: false
    t.bigint "character_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["ability_tag_id"], name: "index_character_abilities_on_ability_tag_id"
    t.index ["character_id"], name: "index_character_abilities_on_character_id"
  end

  create_table "character_image_likes", force: :cascade do |t|
    t.bigint "character_image_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["character_image_id"], name: "index_character_image_likes_on_character_image_id"
    t.index ["user_id", "character_image_id"], name: "index_character_image_likes_on_user_and_image", unique: true
    t.index ["user_id"], name: "index_character_image_likes_on_user_id"
  end

  create_table "character_images", force: :cascade do |t|
    t.boolean "approved", default: true, null: false
    t.bigint "character_id", null: false
    t.datetime "created_at", null: false
    t.string "image_url"
    t.integer "likes_count", default: 0, null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["character_id", "approved"], name: "index_character_images_on_character_id_and_approved"
    t.index ["character_id"], name: "index_character_images_on_character_id"
    t.index ["created_at"], name: "index_character_images_on_created_at"
    t.index ["user_id"], name: "index_character_images_on_user_id"
  end

  create_table "character_personalities", force: :cascade do |t|
    t.bigint "character_id", null: false
    t.datetime "created_at", null: false
    t.bigint "personality_tag_id", null: false
    t.datetime "updated_at", null: false
    t.index ["character_id", "personality_tag_id"], name: "index_char_personalities_on_char_and_tag", unique: true
    t.index ["character_id"], name: "index_character_personalities_on_character_id"
    t.index ["personality_tag_id"], name: "index_character_personalities_on_personality_tag_id"
  end

  create_table "characters", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "element", null: false
    t.string "image_url"
    t.string "light_shadow_type", null: false
    t.string "name", null: false
    t.text "notes"
    t.string "rarity", null: false
    t.datetime "updated_at", null: false
    t.string "weapon_type", null: false
    t.index ["element"], name: "index_characters_on_element"
    t.index ["name"], name: "index_characters_on_name"
    t.index ["rarity"], name: "index_characters_on_rarity"
    t.index ["weapon_type"], name: "index_characters_on_weapon_type"
  end

  create_table "comments", force: :cascade do |t|
    t.text "body", null: false
    t.bigint "commentable_id", null: false
    t.string "commentable_type", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["commentable_type", "commentable_id", "created_at"], name: "index_comments_on_commentable_and_created_at"
    t.index ["commentable_type", "commentable_id"], name: "index_comments_on_commentable"
    t.index ["user_id"], name: "index_comments_on_user_id"
  end

  create_table "draft_party_memberships", force: :cascade do |t|
    t.bigint "character_id", null: false
    t.datetime "created_at", null: false
    t.bigint "draft_party_post_id", null: false
    t.integer "position"
    t.string "slot_type"
    t.datetime "updated_at", null: false
    t.index ["character_id"], name: "index_draft_party_memberships_on_character_id"
    t.index ["draft_party_post_id", "character_id"], name: "index_draft_memberships_on_post_and_character", unique: true
    t.index ["draft_party_post_id"], name: "index_draft_party_memberships_on_draft_party_post_id"
  end

  create_table "draft_party_post_tags", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "draft_party_post_id", null: false
    t.datetime "updated_at", null: false
    t.bigint "use_case_tag_id", null: false
    t.index ["draft_party_post_id", "use_case_tag_id"], name: "index_draft_post_tags_on_post_and_tag", unique: true
    t.index ["draft_party_post_id"], name: "index_draft_party_post_tags_on_draft_party_post_id"
    t.index ["use_case_tag_id"], name: "index_draft_party_post_tags_on_use_case_tag_id"
  end

  create_table "draft_party_posts", force: :cascade do |t|
    t.string "composition_type", null: false
    t.datetime "created_at", null: false
    t.text "description"
    t.text "strategy"
    t.string "title"
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["composition_type"], name: "index_draft_party_posts_on_composition_type"
    t.index ["user_id", "composition_type"], name: "index_draft_party_posts_on_user_id_and_composition_type"
    t.index ["user_id"], name: "index_draft_party_posts_on_user_id"
  end

  create_table "party_memberships", force: :cascade do |t|
    t.bigint "character_id", null: false
    t.datetime "created_at", null: false
    t.bigint "party_post_id", null: false
    t.integer "position", null: false
    t.string "slot_type", null: false
    t.datetime "updated_at", null: false
    t.index ["character_id"], name: "index_party_memberships_on_character_id"
    t.index ["party_post_id", "slot_type", "position"], name: "index_party_memberships_unique", unique: true
    t.index ["party_post_id"], name: "index_party_memberships_on_party_post_id"
  end

  create_table "party_post_tags", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "party_post_id", null: false
    t.datetime "updated_at", null: false
    t.bigint "use_case_tag_id", null: false
    t.index ["party_post_id", "use_case_tag_id"], name: "index_party_post_tags", unique: true
    t.index ["party_post_id"], name: "index_party_post_tags_on_party_post_id"
    t.index ["use_case_tag_id"], name: "index_party_post_tags_on_use_case_tag_id"
  end

  create_table "party_posts", force: :cascade do |t|
    t.integer "comments_count", default: 0, null: false
    t.string "composition_type", default: "full_party", null: false
    t.datetime "created_at", null: false
    t.text "description"
    t.text "strategy"
    t.string "title", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.integer "votes_count", default: 0, null: false
    t.index ["composition_type"], name: "index_party_posts_on_composition_type"
    t.index ["created_at"], name: "index_party_posts_on_created_at"
    t.index ["user_id"], name: "index_party_posts_on_user_id"
    t.index ["votes_count"], name: "index_party_posts_on_votes_count"
  end

  create_table "personality_tags", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "name"
    t.datetime "updated_at", null: false
    t.index ["name"], name: "index_personality_tags_on_name", unique: true
  end

  create_table "use_case_tags", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "name"
    t.datetime "updated_at", null: false
    t.index ["name"], name: "index_use_case_tags_on_name", unique: true
  end

  create_table "user_characters", force: :cascade do |t|
    t.bigint "character_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["character_id"], name: "index_user_characters_on_character_id"
    t.index ["user_id", "character_id"], name: "index_user_characters_on_user_id_and_character_id", unique: true
    t.index ["user_id"], name: "index_user_characters_on_user_id"
  end

  create_table "user_favorite_character_images", force: :cascade do |t|
    t.bigint "character_id", null: false
    t.bigint "character_image_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["character_id"], name: "index_user_favorite_character_images_on_character_id"
    t.index ["character_image_id"], name: "index_user_favorite_character_images_on_character_image_id"
    t.index ["user_id", "character_id"], name: "index_user_favorite_images_on_user_and_character", unique: true
    t.index ["user_id"], name: "index_user_favorite_character_images_on_user_id"
  end

  create_table "users", force: :cascade do |t|
    t.boolean "admin", default: false, null: false
    t.datetime "created_at", null: false
    t.string "email"
    t.string "password_digest"
    t.datetime "updated_at", null: false
    t.string "username"
    t.index ["email"], name: "index_users_on_email", unique: true
    t.index ["username"], name: "index_users_on_username", unique: true
  end

  create_table "versions", force: :cascade do |t|
    t.datetime "created_at"
    t.string "event", null: false
    t.bigint "item_id", null: false
    t.string "item_type", null: false
    t.text "object"
    t.string "whodunnit"
    t.index ["item_type", "item_id"], name: "index_versions_on_item_type_and_item_id"
  end

  create_table "votes", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.integer "value", null: false
    t.bigint "votable_id", null: false
    t.string "votable_type", null: false
    t.index ["user_id", "votable_type", "votable_id"], name: "index_votes_unique_per_user", unique: true
    t.index ["user_id"], name: "index_votes_on_user_id"
    t.index ["votable_type", "votable_id"], name: "index_votes_on_votable"
    t.index ["votable_type", "votable_id"], name: "index_votes_on_votable_type_and_votable_id"
  end

  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
  add_foreign_key "character_abilities", "ability_tags"
  add_foreign_key "character_abilities", "characters"
  add_foreign_key "character_image_likes", "character_images"
  add_foreign_key "character_image_likes", "users"
  add_foreign_key "character_images", "characters"
  add_foreign_key "character_images", "users"
  add_foreign_key "character_personalities", "characters"
  add_foreign_key "character_personalities", "personality_tags"
  add_foreign_key "comments", "users"
  add_foreign_key "draft_party_memberships", "characters"
  add_foreign_key "draft_party_memberships", "draft_party_posts"
  add_foreign_key "draft_party_post_tags", "draft_party_posts"
  add_foreign_key "draft_party_post_tags", "use_case_tags"
  add_foreign_key "draft_party_posts", "users"
  add_foreign_key "party_memberships", "characters"
  add_foreign_key "party_memberships", "party_posts"
  add_foreign_key "party_post_tags", "party_posts"
  add_foreign_key "party_post_tags", "use_case_tags"
  add_foreign_key "party_posts", "users"
  add_foreign_key "user_characters", "characters"
  add_foreign_key "user_characters", "users"
  add_foreign_key "user_favorite_character_images", "character_images"
  add_foreign_key "user_favorite_character_images", "characters"
  add_foreign_key "user_favorite_character_images", "users"
  add_foreign_key "votes", "users"
end
