# Pin npm packages by running ./bin/importmap

pin "application"
pin "@hotwired/turbo-rails", to: "turbo.min.js"
pin "@hotwired/stimulus", to: "stimulus.min.js"
pin "@hotwired/stimulus-loading", to: "stimulus-loading.js"
pin_all_from "app/javascript/controllers", under: "controllers"
pin "lit", to: "https://cdn.jsdelivr.net/npm/lit@3.1.0/+esm"
pin "ninja-keys", to: "https://cdn.jsdelivr.net/npm/ninja-keys@1.2.2/+esm"
