import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["input", "elementFilter", "weaponFilter", "personalityFilter", "abilityFilter", "ownedFilter"]
  static values = { url: String }

  connect() {
    this.timeout = null
    console.log("Character search controller connected")
    console.log("Search URL:", this.urlValue)
  }

  search() {
    clearTimeout(this.timeout)

    this.timeout = setTimeout(() => {
      const params = new URLSearchParams({
        query: this.hasInputTarget ? this.inputTarget.value : "",
        element: this.hasElementFilterTarget ? this.elementFilterTarget.value : "",
        weapon: this.hasWeaponFilterTarget ? this.weaponFilterTarget.value : "",
        personalities: this.getSelectedPersonalities(),
        abilities: this.getSelectedAbilities(),
        show_only_owned: this.hasOwnedFilterTarget && this.ownedFilterTarget.checked ? '1' : '0'
      })

      const url = `${this.urlValue}?${params}`
      console.log("Searching with URL:", url)

      fetch(url, {
        headers: { "Accept": "text/vnd.turbo-stream.html" }
      })
      .then(response => {
        console.log("Response status:", response.status)
        return response.text()
      })
      .then(html => {
        console.log("Received HTML length:", html.length)
        Turbo.renderStreamMessage(html)
      })
      .catch(error => {
        console.error("Search error:", error)
      })
    }, 300)
  }

  getSelectedPersonalities() {
    if (!this.hasPersonalityFilterTarget) return ""

    const checkboxes = Array.from(this.personalityFilterTargets).filter(cb => cb.checked)
    return checkboxes.map(cb => cb.value).join(',')
  }

  getSelectedAbilities() {
    if (!this.hasAbilityFilterTarget) return ""

    const checkboxes = Array.from(this.abilityFilterTargets).filter(cb => cb.checked)
    return checkboxes.map(cb => cb.value).join(',')
  }
}
