class ChangeImageUrlToNullableInCharacterImages < ActiveRecord::Migration[8.1]
  def change
    change_column_null :character_images, :image_url, true
  end
end
