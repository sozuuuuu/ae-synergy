class CommandPaletteController < ApplicationController
  include CharactersHelper
  skip_before_action :require_login, raise: false

  def search
    query = params[:query].to_s.strip

    results = []

    if query.present?
      # Search characters
      results += search_characters(query)

      # Search party posts
      results += search_party_posts(query, 'full_party')

      # Search synergy posts
      results += search_party_posts(query, 'synergy')
    end

    render json: results
  end

  private

  def search_characters(query)
    Character.search(query).limit(5).map do |character|
      {
        id: "character-#{character.id}",
        title: character.name,
        section: "キャラクター",
        icon: element_icon(character.element),
        handler: character_path(character)
      }
    end
  end

  def search_party_posts(query, composition_type)
    # PartyPost.search scope will be added in the next step
    # For now, we'll use a basic where clause
    posts = PartyPost.where(composition_type: composition_type)

    # Check if the search scope exists
    if PartyPost.respond_to?(:search)
      posts = posts.search(query)
    else
      # Fallback: manual ILIKE search
      posts = posts.where("title ILIKE ? OR description ILIKE ?",
                         "%#{ActiveRecord::Base.sanitize_sql_like(query)}%",
                         "%#{ActiveRecord::Base.sanitize_sql_like(query)}%")
    end

    posts.limit(5).map do |post|
      {
        id: "#{composition_type}-#{post.id}",
        title: post.title,
        section: composition_type == 'synergy' ? 'シナジー' : 'パーティー',
        handler: post.synergy? ? synergy_post_path(post) : party_post_path(post)
      }
    end
  end
end
