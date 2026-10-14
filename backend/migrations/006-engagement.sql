-- 006-engagement: notifications, devices, prefs, saved, support, help, content, audit, meta.
CREATE TABLE IF NOT EXISTS notifications (
  id CHAR(26) PRIMARY KEY, user_id CHAR(26) NOT NULL, type VARCHAR(50) NOT NULL,
  title VARCHAR(150) NOT NULL, body VARCHAR(500) NOT NULL,
  ref_type VARCHAR(50) NULL, ref_id CHAR(26) NULL,
  read_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notif_user (user_id, created_at)
);
CREATE TABLE IF NOT EXISTS devices (
  id CHAR(26) PRIMARY KEY, user_id CHAR(26) NOT NULL,
  platform ENUM('ios','android') NOT NULL, push_token VARCHAR(500) NOT NULL UNIQUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_devices_user (user_id)
);
CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id CHAR(26) PRIMARY KEY, push TINYINT(1) NOT NULL DEFAULT 1, email TINYINT(1) NOT NULL DEFAULT 1,
  upcoming_reminders TINYINT(1) NOT NULL DEFAULT 1, event_updates TINYINT(1) NOT NULL DEFAULT 1,
  ticket_updates TINYINT(1) NOT NULL DEFAULT 1, saved_activity TINYINT(1) NOT NULL DEFAULT 1,
  community_activity TINYINT(1) NOT NULL DEFAULT 1, community_events TINYINT(1) NOT NULL DEFAULT 1,
  mentions_replies TINYINT(1) NOT NULL DEFAULT 1, recommended_events TINYINT(1) NOT NULL DEFAULT 1,
  nearby_events TINYINT(1) NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS saved_events (
  user_id CHAR(26) NOT NULL, event_id CHAR(26) NOT NULL,
  saved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, event_id)
);
CREATE TABLE IF NOT EXISTS saved_communities (
  user_id CHAR(26) NOT NULL, community_id CHAR(26) NOT NULL,
  saved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, community_id)
);
CREATE TABLE IF NOT EXISTS support_threads (
  id CHAR(26) PRIMARY KEY, user_id CHAR(26) NOT NULL, topic VARCHAR(100) NOT NULL,
  status ENUM('open','closed') NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_threads_user (user_id, updated_at)
);
CREATE TABLE IF NOT EXISTS support_messages (
  id CHAR(26) PRIMARY KEY, conversation_id CHAR(26) NOT NULL,
  sender ENUM('user','support') NOT NULL, text VARCHAR(2000) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_msg_conv (conversation_id, created_at)
);
CREATE TABLE IF NOT EXISTS help_articles (
  id CHAR(26) PRIMARY KEY, title VARCHAR(200) NOT NULL, category VARCHAR(100) NOT NULL,
  body TEXT NOT NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS content_pages (
  slug VARCHAR(50) PRIMARY KEY, title VARCHAR(200) NOT NULL, body TEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id CHAR(26) PRIMARY KEY, action VARCHAR(100) NOT NULL, actor_id CHAR(26) NOT NULL,
  entity_type VARCHAR(50) NOT NULL, entity_id CHAR(26) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit (action, created_at), INDEX idx_audit_entity (entity_type, entity_id)
);
CREATE TABLE IF NOT EXISTS meta_categories (name VARCHAR(100) PRIMARY KEY);
CREATE TABLE IF NOT EXISTS meta_interests (name VARCHAR(100) PRIMARY KEY);
CREATE TABLE IF NOT EXISTS meta_languages (name VARCHAR(20) PRIMARY KEY);
CREATE TABLE IF NOT EXISTS meta_cities (name VARCHAR(100) PRIMARY KEY, state VARCHAR(100) NOT NULL);
INSERT IGNORE INTO meta_categories (name) VALUES ('Music'),('Fitness'),('Tech'),('Travel'),('Design');
INSERT IGNORE INTO meta_interests (name) VALUES ('Music'),('Fitness'),('Tech'),('Travel'),('Design');
INSERT IGNORE INTO meta_languages (name) VALUES ('en-IN'),('hi-IN');
INSERT IGNORE INTO meta_cities (name, state) VALUES ('Mumbai','Maharashtra'),('Bengaluru','Karnataka');
INSERT IGNORE INTO content_pages (slug, title, body) VALUES
 ('refund-policy','Refund Policy','Refunds are processed to the original payment method.'),
 ('privacy-policy','Privacy Policy','We collect only city-level location.'),
 ('safety-guidelines','Safety Guidelines','Follow event rules and local laws.'),
 ('child-safety','Child Safety','Report any child-safety concern immediately.'),
 ('moderation-guidelines','Moderation Guidelines','Hosts must follow community standards.');
