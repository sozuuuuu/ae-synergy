module CharactersHelper
  ELEMENT_ICONS = {
    "Fire" => "🔥",
    "Water" => "💧",
    "Earth" => "🌍",
    "Wind" => "💨",
    "Thunder" => "⚡",
    "Shade" => "🌑",
    "Crystal" => "💎",
    "None" => "⚪"
  }.freeze

  WEAPON_ICONS = {
    "Sword" => "⚔️",
    "Katana" => "🗡️",
    "Axe" => "🪓",
    "Lance" => "🔱",
    "Bow" => "🏹",
    "Staff" => "🪄",
    "Fists" => "👊",
    "Hammer" => "🔨"
  }.freeze

  LIGHT_SHADOW_ICONS = {
    "Light" => "☀️",
    "Shadow" => "🌙"
  }.freeze

  def element_icon(element)
    ELEMENT_ICONS[element] || element
  end

  def weapon_icon(weapon)
    WEAPON_ICONS[weapon] || weapon
  end

  def light_shadow_icon(type)
    LIGHT_SHADOW_ICONS[type] || type
  end

  def element_with_icon(element)
    "#{element_icon(element)} #{element}"
  end

  def weapon_with_icon(weapon)
    "#{weapon_icon(weapon)} #{weapon}"
  end

  def light_shadow_with_icon(type)
    "#{light_shadow_icon(type)} #{type}"
  end
end
