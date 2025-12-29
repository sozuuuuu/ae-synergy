Rails.application.routes.draw do
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  # Render dynamic PWA files from app/views/pwa/* (remember to link manifest in application.html.erb)
  # get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  # get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  # Defines the root path route ("/")
  root "characters#index"

  # Authentication
  get "login", to: "sessions#new"
  post "login", to: "sessions#create"
  delete "logout", to: "sessions#destroy"
  post "dev_login", to: "sessions#dev_login" if Rails.env.development?

  resources :users, only: [:new, :create]

  # Dashboard (マイページ)
  get 'dashboard', to: 'dashboard#index', as: :dashboard

  # Characters (Wiki - Read-only, managed via YAML)
  resources :characters, only: [:index, :show] do
    collection do
      get :search
      post :batch_add_ownership
      post :batch_remove_ownership
    end
    member do
      post :toggle_ownership
    end
    resources :character_images, only: [:create, :destroy] do
      member do
        post :set_favorite
        post :like
        delete :unlike
      end
    end
    post :unset_favorite_image, to: 'character_images#unset_favorite', on: :member
  end

  # Draft Party Posts (編集中)
  get 'draft_party_posts/:id/edit', to: 'party_posts#edit', as: :edit_draft_party_post
  patch 'draft_party_posts/:id', to: 'party_posts#update', as: :draft_party_post
  delete 'draft_party_posts/:id', to: 'party_posts#destroy'
  post 'draft_party_posts/:id/publish', to: 'party_posts#publish', as: :publish_draft_party_post

  # Synergy Posts (now unified with Party Posts)
  get 'synergy_posts', to: 'party_posts#index', defaults: { composition_type: 'synergy' }, as: :synergy_posts
  get 'synergy_posts/new', to: 'party_posts#new', defaults: { composition_type: 'synergy' }, as: :new_synergy_post
  get 'synergy_posts/:id', to: 'party_posts#show', as: :synergy_post
  resources :synergy_posts, only: [] do
    resources :comments, only: [:create, :destroy]
  end

  # Party Posts (full party compositions)
  get 'party_posts', to: 'party_posts#index', defaults: { composition_type: 'full_party' }
  get 'party_posts/new', to: 'party_posts#new', defaults: { composition_type: 'full_party' }, as: :new_party_post
  resources :party_posts, only: [:show, :destroy] do
    resources :comments, only: [:create, :destroy]
  end

  # Votes
  post 'votes', to: 'votes#create'

  # TODO: Add routes for versions
end
