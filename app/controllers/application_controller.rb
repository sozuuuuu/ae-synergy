class ApplicationController < ActionController::Base
  # Only allow modern browsers supporting webp images, web push, badges, import maps, CSS nesting, and CSS :has.
  allow_browser versions: :modern

  # Changes to the importmap will invalidate the etag for HTML responses
  stale_when_importmap_changes

  before_action :set_current_user
  helper_method :current_user, :logged_in?

  private

  def set_current_user
    @current_user = User.find_by(id: session[:user_id]) if session[:user_id]
  end

  def current_user
    @current_user
  end

  def logged_in?
    current_user.present?
  end

  def require_login
    unless logged_in?
      session[:return_to] = request.fullpath
      flash[:alert] = "ログインが必要です"
      redirect_to login_path
    end
  end
end
