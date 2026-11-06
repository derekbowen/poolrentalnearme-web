# Test double for tests/test_cw_setup_nginx.py: the handful of Chatwoot/ActiveRecord calls cw_setup.rb makes,
# in memory, so the real cw_setup.rb runs under plain ruby (ruby -r ./cw_setup_stub.rb cw_setup.rb).
# PRNM_TEST_SEED: "" fresh install | "tokens" both founders exist with an outstanding reset token | "foreign" an
# unrelated account exists. PRNM_TEST_DIR: where /tmp/prnm_bot.json is redirected. At exit it prints
# "PRNM_TEST <json>" with the resulting state (token digests, flags, labels, upload limit).
require 'json'
require 'securerandom'
require 'digest'

module SecureRandom # ActiveSupport adds base58
  def self.base58(n = 16) = alphanumeric(n)
end

class Object
  def present? = !(nil? || (respond_to?(:empty?) && empty?))
end

DB = Hash.new { |h, k| h[k] = [] }

class Rec
  def self.table = superclass == Rec ? DB[name] : superclass.table
  def self.match(h) = table.find { |r| h.all? { |k, v| r.a[k] == v } }
  def self.find_by(h) = match(h)
  def self.exists? = !table.empty?
  def self.count = table.size
  def self.create!(h = {}) = new(h).tap(&:save!)
  def self.find_or_initialize_by(h) = match(h) || new(h)

  def self.find_or_create_by!(h)
    match(h) || new(h).tap { |r| yield r if block_given?; r.save! }
  end

  attr_reader :a

  def initialize(h = {})
    @a = {}
    h.each { |k, v| send("#{k}=", v) }
  end

  def method_missing(m, *args)
    k = m.to_s
    return @a[k.chomp('=').to_sym] = args[0] if k.end_with?('=')
    return nil if k.end_with?('!')
    @a[m]
  end

  def respond_to_missing?(*) = true
  def id = @a[:id]
  def reload = self

  def save!
    unless self.class.table.include?(self)
      self.class.table << self
      @a[:id] = self.class.table.size
    end
    true
  end

  def update!(h)
    h.each { |k, v| send("#{k}=", v) }
    save!
  end

  def update_columns(h)
    h.each { |k, v| @a[k] = v }
    true
  end
end

class Rel
  def initialize(klass, scope) = (@k, @s = klass, scope)
  def find_by(h) = @k.find_by(@s.merge(h))
end

class Account < Rec
  def inboxes = Rel.new(Inbox, account: self)
end

module Chatwoot # as config/application.rb: 2FA exists only when all three encryption keys are in the env
  KEYS = %w[ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY
            ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT].freeze
  def self.mfa_enabled? = KEYS.all? { |k| ENV[k].present? }
end

class User < Rec
  def notification_settings = Rel.new(NotificationSetting, user_id: id)
  def mfa_enabled? = @a[:otp_required_for_login] == true

  def set_reset_password_token
    raw = SecureRandom.urlsafe_base64(15)
    update_columns(reset_password_token: Digest::SHA256.hexdigest(raw), reset_password_sent_at: Time.now)
    raw
  end
end

class SuperAdmin < User; end
class AccountUser < Rec; end
class NotificationSetting < Rec; end
class Inbox < Rec; end
class InboxMember < Rec; end
class Label < Rec; end
class CustomAttributeDefinition < Rec; end
class AgentBotInbox < Rec; end

module Channel
  class WebWidget < Rec
    BITS = { attachments: 1, emoji_picker: 2, end_conversation: 4 }.freeze
    def initialize(h = {}) = super(h.merge(website_token: 'WebsiteTok1234567890abc', selected_feature_flags: BITS.keys))
    def feature_flags = Array(@a[:selected_feature_flags]).sum { |f| BITS.fetch(f.to_sym) }
  end
end

class InstallationConfig < Rec; end

class AgentBot < Rec
  def access_token = Struct.new(:token).new('BotTok' + 'Q' * 18)
  def secret = 'Secr' + 'Z' * 20
end

module GlobalConfigService
  def self.load(k, d) = InstallationConfig.find_by(name: k)&.value || d
end

module Redis
  module Alfred
    CHATWOOT_INSTALLATION_ONBOARDING = 'CHATWOOT_INSTALLATION_ONBOARDING'.freeze
    @deleted = []
    class << self
      attr_reader :deleted

      def delete(k) = @deleted << k
    end
  end
end

class << File
  alias_method :prnm_orig_write, :write
  def write(p, *a, **k) = prnm_orig_write(p == '/tmp/prnm_bot.json' ? File.join(ENV.fetch('PRNM_TEST_DIR'), 'prnm_bot.json') : p, *a, **k)
end

case ENV['PRNM_TEST_SEED'].to_s
when 'tokens'
  acct = Account.create!(name: 'Pool Rental Near Me', locale: 'en')
  [['Derek Bowen', 'derek@poolrentalnearme.com', SuperAdmin], ['Brandon Elias', 'brandon@poolrentalnearme.com', User]].each do |n, e, k|
    u = k.create!(name: n, email: e)
    u.update_columns(reset_password_token: 'old-digest-' + e, reset_password_sent_at: Time.now,
                     otp_required_for_login: k == SuperAdmin) # Derek has already turned 2FA on
    AccountUser.create!(account: acct, user: u, role: :administrator)
  end
when 'foreign'
  Account.create!(name: 'Someone else')
end

at_exit do
  users = User.table.map do |u|
    [u.email, { type: u.class.name, token: u.reset_password_token,
                push: NotificationSetting.find_by(user_id: u.id)&.selected_push_flags }]
  end.to_h
  w = Channel::WebWidget.table.first
  puts "PRNM_TEST #{{ users: users, feature_flags: w&.feature_flags, labels: Label.table.map(&:title),
                      max_upload: GlobalConfigService.load('MAXIMUM_FILE_UPLOAD_SIZE', 40),
                      onboarding_deleted: Redis::Alfred.deleted,
                      bot_inbox_status: AgentBotInbox.table.first&.status }.to_json}"
end
