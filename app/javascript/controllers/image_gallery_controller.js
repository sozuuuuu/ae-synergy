import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["mainImage", "favoriteButton"]

  selectImage(event) {
    const thumbnail = event.currentTarget
    const imageUrl = thumbnail.dataset.imageUrl
    const imageId = thumbnail.dataset.imageId
    const username = thumbnail.dataset.imageUsername
    const likesCount = thumbnail.dataset.imageLikesCount
    const likeUrl = thumbnail.dataset.likeUrl
    const userLiked = thumbnail.dataset.userLiked === "true"
    const favoriteUrl = thumbnail.dataset.favoriteUrl
    const isFavorite = thumbnail.dataset.isFavorite === "true"

    // メイン画像を更新
    this.mainImageTarget.src = imageUrl

    // 投稿者情報といいね数を更新
    const likesCountSpan = document.getElementById('likes_count')
    if (likesCountSpan) {
      likesCountSpan.textContent = likesCount
    }

    // いいねボタンを更新
    const likeButtonContainer = document.getElementById('like_button')
    if (likeButtonContainer) {
      const likeForm = likeButtonContainer.querySelector('form')
      if (likeForm) {
        likeForm.action = likeUrl

        const likeButtonElement = likeForm.querySelector('button')
        if (userLiked) {
          likeButtonElement.textContent = '❤️ いいね済み'
          likeButtonElement.className = 'text-sm px-3 py-1 rounded bg-red-500 text-white hover:opacity-80'
        } else {
          likeButtonElement.textContent = '🤍 いいね'
          likeButtonElement.className = 'text-sm px-3 py-1 rounded bg-gray-200 text-gray-700 hover:opacity-80'
        }
      }
    }

    // お気に入りボタンを更新
    if (this.hasFavoriteButtonTarget) {
      const favoriteForm = this.favoriteButtonTarget.querySelector('form')
      if (favoriteForm) {
        favoriteForm.action = favoriteUrl

        const favoriteButtonElement = favoriteForm.querySelector('button')
        if (isFavorite) {
          favoriteButtonElement.textContent = '★ お気に入り中'
          favoriteButtonElement.className = 'text-sm px-3 py-1 rounded bg-yellow-400 text-yellow-900 hover:opacity-80'
        } else {
          favoriteButtonElement.textContent = '☆ お気に入りに設定'
          favoriteButtonElement.className = 'text-sm px-3 py-1 rounded bg-gray-200 text-gray-700 hover:opacity-80'
        }
      }
    }
  }
}
