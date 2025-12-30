namespace :admin do
  desc "Promote a user to admin (usage: rails admin:promote EMAIL=user@example.com or USERNAME=username)"
  task promote: :environment do
    user = find_user

    if user.nil?
      puts "Error: User not found. Please specify EMAIL or USERNAME."
      exit 1
    end

    if user.admin?
      puts "User '#{user.username}' (#{user.email}) is already an admin."
    else
      user.update!(admin: true)
      puts "✓ User '#{user.username}' (#{user.email}) has been promoted to admin."
    end
  end

  desc "Demote a user from admin (usage: rails admin:demote EMAIL=user@example.com or USERNAME=username)"
  task demote: :environment do
    user = find_user

    if user.nil?
      puts "Error: User not found. Please specify EMAIL or USERNAME."
      exit 1
    end

    if !user.admin?
      puts "User '#{user.username}' (#{user.email}) is already a regular user."
    else
      user.update!(admin: false)
      puts "✓ User '#{user.username}' (#{user.email}) has been demoted to regular user."
    end
  end

  desc "List all admin users"
  task list: :environment do
    admins = User.where(admin: true).order(:created_at)

    if admins.empty?
      puts "No admin users found."
    else
      puts "=" * 80
      puts "Admin Users (#{admins.count})"
      puts "=" * 80
      admins.each_with_index do |admin, index|
        puts "#{index + 1}. #{admin.username} (#{admin.email}) - ID: #{admin.id}"
      end
      puts "=" * 80
    end
  end

  desc "Show user admin status (usage: rails admin:status EMAIL=user@example.com or USERNAME=username)"
  task status: :environment do
    user = find_user

    if user.nil?
      puts "Error: User not found. Please specify EMAIL or USERNAME."
      exit 1
    end

    puts "=" * 80
    puts "User Information"
    puts "=" * 80
    puts "Username: #{user.username}"
    puts "Email:    #{user.email}"
    puts "ID:       #{user.id}"
    puts "Admin:    #{user.admin? ? 'Yes' : 'No'}"
    puts "=" * 80
  end

  private

  def find_user
    if ENV['EMAIL'].present?
      User.find_by(email: ENV['EMAIL'])
    elsif ENV['USERNAME'].present?
      User.find_by(username: ENV['USERNAME'])
    else
      nil
    end
  end
end
