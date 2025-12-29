class SessionsController < ApplicationController
  skip_before_action :require_login, only: [:new, :create, :dev_login], raise: false

  def new
  end

  def create
    user = User.find_by(email: params[:email])

    if user&.authenticate(params[:password])
      session[:user_id] = user.id
      return_to = session.delete(:return_to) || root_path
      redirect_to return_to, notice: "ログインしました"
    else
      flash.now[:alert] = "メールアドレスまたはパスワードが正しくありません"
      render :new, status: :unprocessable_entity
    end
  end

  def destroy
    session[:user_id] = nil
    redirect_to root_path, notice: "ログアウトしました"
  end

  def dev_login
    return head :forbidden unless Rails.env.development?

    user = User.find_by(username: params[:username])
    if user
      session[:user_id] = user.id
      return_to = session.delete(:return_to) || root_path
      redirect_to return_to, notice: "#{user.username}としてログインしました"
    else
      redirect_to root_path, alert: "ユーザーが見つかりません"
    end
  end
end
