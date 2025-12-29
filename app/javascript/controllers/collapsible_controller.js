import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["content"]

  toggle() {
    this.contentTarget.classList.toggle("hidden")

    // Update arrow icon
    const arrow = this.element.querySelector("[data-collapsible-arrow]")
    if (arrow) {
      arrow.classList.toggle("rotate-180")
    }
  }
}
