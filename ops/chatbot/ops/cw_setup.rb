# Runs in chatwoot-rails-1 via cw_setup.py (embedded: selfcheck.py --embed). The why: cw_setup.py, cw_push_test.py.
url = ENV.fetch('PRNM_BOT_URL')
link_for = ENV['PRNM_LINK_FOR'].to_s # '' | derek | brandon: the one reset link this run prints (D6)
people = [%w[derek Derek\ Bowen derek@poolrentalnearme.com], %w[brandon Brandon\ Elias brandon@poolrentalnearme.com]]
acct = Account.find_by(name: 'Pool Rental Near Me')
raise "not a fresh install: #{Account.count} accounts, #{User.count} users" if acct.nil? && (Account.exists? || User.exists?)
acct ||= Account.create!(name: 'Pool Rental Near Me', locale: 'en')
# 2FA required (4.19+, needs the 3 keys): enrolment at password sign-in; the bot token is exempt
acct.update!(enforce_mfa: true) if Chatwoot.mfa_enabled? && acct.respond_to?(:enforce_mfa=)
# cw_setup.py KEEP_PENDING (Derek decides); '' leaves it
kp = ENV['PRNM_KEEP_PENDING'].to_s
acct.update!(keep_pending_on_bot_failure: kp == 'true') if %w[true false].include?(kp) && acct.respond_to?(:keep_pending_on_bot_failure=)
users = people.map do |key, name, email|
  u = User.find_by(email: email)
  unless u
    pw = "#{SecureRandom.base58(40)}aA1!" # random, never shown
    u = (key == 'derek' ? SuperAdmin : User).new(name: name, email: email, password: pw, password_confirmation: pw)
    u.skip_confirmation!
    u.save!
  end
  au = AccountUser.find_or_create_by!(account: acct, user: u) { |x| x.role = :administrator }
  au.update!(role: :administrator)
  ns = NotificationSetting.find_or_create_by!(account_id: acct.id, user_id: u.id)
  ns.selected_email_flags = [] # no SMTP
  # D5 push; why these and never participating: cw_push_test.py
  ns.selected_push_flags = %w[push_conversation_creation push_conversation_mention push_conversation_assignment
                              push_assigned_conversation_new_message]
  ns.save!
  u
end
inbox = acct.inboxes.find_by(name: 'PRNM Website') ||
        Inbox.create!(account: acct, name: 'PRNM Website',
                      channel: Channel::WebWidget.create!(account: acct, website_url: 'https://www.poolrentalnearme.com'))
inbox.channel.update!(
  widget_color: '#0EA5E9', welcome_title: "Hey, glad you're here.",
  welcome_tagline: 'What can I help you with? This is our automated assistant: scripted, not AI.',
  reply_time: :in_a_day, pre_chat_form_enabled: false, continuity_via_email: false,
  allowed_domains: %w[com co.uk ca com.au].flat_map { |t| ["poolrentalnearme.#{t}", "www.poolrentalnearme.#{t}"] }.join(','),
  selected_feature_flags: %i[emoji_picker] # no attachments, no end_conversation (D3)
)
inbox.update!(enable_auto_assignment: false, enable_email_collect: false, greeting_enabled: false,
              csat_survey_enabled: false, working_hours_enabled: false)
users.each { |u| InboxMember.find_or_create_by!(inbox: inbox, user: u) }
# 1 MB cap on every attachment; this row wins over ENV
InstallationConfig.find_or_initialize_by(name: 'MAXIMUM_FILE_UPLOAD_SIZE').update!(value: 1, locked: false)
labels = { 'handoff' => '#E11D48', 'urgent' => '#B91C1C', 'handoff-capped' => '#7C3AED', 'handoff-overflow' => '#6D28D9',
           'bot-answered' => '#0EA5E9', 'unmatched' => '#F59E0B' }
%w[booking payments cancellations rules arrival safety host-listing host-pricing payouts account].each { |t| labels["topic-#{t}"] = '#64748B' }
%w[host swimmer].each { |r| labels["role-#{r}"] = '#94A3B8' }
labels.each { |t, c| Label.find_or_create_by!(account: acct, title: t) { |l| l.color = c; l.show_on_sidebar = true } }
%w[prnm_role prnm_topic prnm_booking_ref prnm_reply_method prnm_urgency].each do |k|
  CustomAttributeDefinition.find_or_create_by!(account: acct, attribute_key: k, attribute_model: :conversation_attribute) do |d|
    d.attribute_display_name = k[5..].tr('_', ' ').capitalize
  end
end
bot = AgentBot.find_or_create_by!(account: acct, name: 'PRNM Assistant (automated)') do |b|
  b.description = 'Scripted assistant, not AI. Hands off to Derek and Brandon.'
end
bot.update!(outgoing_url: url)
AgentBotInbox.find_or_initialize_by(inbox: inbox).update!(agent_bot: bot, status: :active)
Redis::Alfred.delete(Redis::Alfred::CHATWOOT_INSTALLATION_ONBOARDING)
File.write('/tmp/prnm_bot.json', { token: bot.access_token.token, secret: bot.secret }.to_json, perm: 0o600)
o = { account_id: acct.id, inbox_id: inbox.id, website_token: inbox.channel.website_token, bot_id: bot.id,
      bot_url: bot.outgoing_url, derek_id: users[0].id, brandon_id: users[1].id,
      feature_flags: inbox.channel.reload.feature_flags, max_upload_mb: GlobalConfigService.load('MAXIMUM_FILE_UPLOAD_SIZE', 40),
      push_flags: users.map { |u| u.notification_settings.find_by(account_id: acct.id).selected_push_flags },
      mfa_available: Chatwoot.mfa_enabled?, mfa_on: users.map(&:mfa_enabled?), links: [], revoked: [],
      mfa_enforced: acct.reload.try(:enforce_mfa?) == true, keep_pending: acct.try(:keep_pending_on_bot_failure) == true }
# Chatwoot never enforces the reset expiry: only the link printed now stays live (D6)
people.zip(users).each do |(key, _, email), u|
  if key == link_for
    o[:links] << [email, "#{ENV.fetch('FRONTEND_URL')}/app/auth/password/edit?reset_password_token=#{u.send(:set_reset_password_token)}"]
  elsif u.reload.reset_password_token.present?
    u.update_columns(reset_password_token: nil, reset_password_sent_at: nil)
    o[:revoked] << email
  end
end
puts "PRNM_OUT #{o.to_json}"
