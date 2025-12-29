ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"

module ActiveSupport
  class TestCase
    # Run tests in parallel with specified workers
    # Disabled for system tests to avoid conflicts
    parallelize(workers: :number_of_processors) unless ENV["DISABLE_SPRING"]

    # Setup all fixtures in test/fixtures/*.yml for all tests in alphabetical order.
    # fixtures :all  # Commented out - using seed data instead

    # Add more helper methods to be used by all tests here...
  end
end
