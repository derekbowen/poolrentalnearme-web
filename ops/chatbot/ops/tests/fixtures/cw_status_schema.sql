-- The Chatwoot 4.19.1 tables and columns cw_status.py reads (names and types from db/schema.rb at v4.19.1,
-- caab07a8). Used by tests/test_cw_setup_nginx.py to run every cw_status.py query in a throwaway PostgreSQL.
create table accounts (id serial primary key, name varchar, settings jsonb default '{}');
create table users (id serial primary key, name varchar, email varchar, type varchar, reset_password_token varchar,
                    otp_required_for_login boolean default false);
create table account_users (id serial primary key, account_id bigint, user_id bigint, role integer);
create table inboxes (id serial primary key, name varchar, enable_auto_assignment boolean, enable_email_collect boolean,
                      channel_type varchar, channel_id integer);
create table channel_web_widgets (id serial primary key, feature_flags integer, reply_time integer,
                                  continuity_via_email boolean, website_token varchar);
create table inbox_members (id serial primary key, inbox_id integer, user_id integer);
create table agent_bots (id serial primary key, name varchar, outgoing_url varchar);
create table agent_bot_inboxes (id serial primary key, agent_bot_id integer, inbox_id integer, status integer);
create table notification_settings (id serial primary key, user_id integer, email_flags integer, push_flags integer);
create table notification_subscriptions (id serial primary key, user_id bigint, subscription_type integer);
create table contacts (id serial primary key, created_at timestamp);
create table contact_inboxes (id serial primary key);
create table conversations (id serial primary key, display_id integer, status integer, priority integer,
                            assignee_id integer, created_at timestamp);
create table tags (id serial primary key, name varchar);
create table taggings (id serial primary key, tag_id integer, taggable_type varchar, taggable_id integer,
                       context varchar, created_at timestamp);
create table messages (id serial primary key, content text, conversation_id integer, message_type integer,
                       private boolean default false, sender_type varchar, created_at timestamp);
create table notifications (id serial primary key, user_id bigint, notification_type integer, created_at timestamp);
create table installation_configs (id serial primary key, name varchar, serialized_value jsonb);
create table schema_migrations (version varchar primary key);
