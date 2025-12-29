import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["input", "preview", "dropzone"]

  handleDragOver(event) {
    event.preventDefault()
    event.currentTarget.classList.add("border-indigo-500", "bg-indigo-50")
  }

  handleDragLeave(event) {
    event.preventDefault()
    event.currentTarget.classList.remove("border-indigo-500", "bg-indigo-50")
  }

  handleDrop(event) {
    event.preventDefault()
    event.currentTarget.classList.remove("border-indigo-500", "bg-indigo-50")

    const files = event.dataTransfer.files
    if (files.length > 0) {
      this.inputTarget.files = files
      this.showPreview(files[0])
    }
  }

  handleFileSelect(event) {
    const file = event.target.files[0]
    if (file) {
      this.showPreview(file)
    }
  }

  showPreview(file) {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => {
        this.previewTarget.innerHTML = `
          <img src="${e.target.result}" class="max-w-full max-h-64 mx-auto rounded shadow-lg">
          <p class="text-sm text-gray-600 mt-2">${file.name}</p>
        `
        this.previewTarget.classList.remove("hidden")
      }
      reader.readAsDataURL(file)
    }
  }

  clickInput() {
    this.inputTarget.click()
  }
}
