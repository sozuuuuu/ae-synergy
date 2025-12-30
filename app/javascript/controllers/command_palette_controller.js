import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static values = {
    searchUrl: String,
    loggedIn: String
  }

  connect() {
    console.log("Command palette controller connected")
    console.log("Logged in:", this.loggedInValue)
    console.log("Search URL:", this.searchUrlValue)

    // Initialize search timeout
    this.searchTimeout = null

    // Initialize ninja-keys with static actions
    this.element.data = this.staticActions()

    // Listen for input changes to trigger search
    this.element.addEventListener('change', (event) => {
      this.search(event.detail.search)
    })
  }

  staticActions() {
    const isLoggedIn = this.loggedInValue === 'true'

    const actions = [
      // Navigation actions
      {
        id: 'nav-home',
        title: 'ホーム',
        section: 'ページ',
        hotkey: 'h',
        handler: () => this.navigate('/')
      },
      {
        id: 'nav-characters',
        title: 'キャラクター一覧',
        section: 'ページ',
        hotkey: 'c',
        handler: () => this.navigate('/characters')
      },
      {
        id: 'nav-synergies',
        title: 'シナジー投稿',
        section: 'ページ',
        hotkey: 's',
        handler: () => this.navigate('/synergy_posts')
      },
      {
        id: 'nav-parties',
        title: 'パーティー投稿',
        section: 'ページ',
        hotkey: 'p',
        handler: () => this.navigate('/party_posts')
      }
    ]

    // Add logged-in only actions
    if (isLoggedIn) {
      actions.push(
        {
          id: 'nav-dashboard',
          title: 'マイページ',
          section: 'ページ',
          hotkey: 'd',
          handler: () => this.navigate('/dashboard')
        },
        {
          id: 'action-new-synergy',
          title: '新しいシナジーを投稿',
          section: 'アクション',
          hotkey: 'n s',
          handler: () => this.navigate('/synergy_posts/new')
        },
        {
          id: 'action-new-party',
          title: '新しいパーティーを投稿',
          section: 'アクション',
          hotkey: 'n p',
          handler: () => this.navigate('/party_posts/new')
        }
      )
    } else {
      actions.push({
        id: 'nav-login',
        title: 'ログイン',
        section: 'アクション',
        hotkey: 'l',
        handler: () => this.navigate('/login')
      })
    }

    return actions
  }

  navigate(path) {
    // Use Turbo.visit for SPA-like navigation
    if (typeof Turbo !== 'undefined') {
      Turbo.visit(path)
    } else {
      window.location.href = path
    }
  }

  search(query) {
    // Clear previous timeout
    clearTimeout(this.searchTimeout)

    // If query is empty, show only static actions
    if (!query || query.trim() === '') {
      this.element.data = this.staticActions()
      return
    }

    // Debounce search with 300ms delay
    this.searchTimeout = setTimeout(() => {
      this.performSearch(query)
    }, 300)
  }

  performSearch(query) {
    const url = `${this.searchUrlValue}?query=${encodeURIComponent(query)}`

    fetch(url, {
      headers: {
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Search request failed')
      }
      return response.json()
    })
    .then(results => {
      // Merge static actions with search results
      const mergedActions = this.staticActions().concat(
        results.map(result => ({
          ...result,
          handler: () => this.navigate(result.handler)
        }))
      )

      // Update ninja-keys data
      this.element.data = mergedActions
    })
    .catch(error => {
      console.error('Search error:', error)
      // On error, show only static actions
      this.element.data = this.staticActions()
    })
  }
}
