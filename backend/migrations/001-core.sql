-- 001-core: users, otp_codes, refresh_tokens, idempotency_keys (§2-3 slice).
CREATE TABLE IF NOT EXISTS users (
  id CHAR(26) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  username VARCHAR(30) NULL UNIQUE,
  phone VARCHAR(16) NULL,
  email VARCHAR(254) NULL,
  password_hash VARCHAR(255) NULL,
  role ENUM('user','host','event_staff','super_admin') NOT NULL DEFAULT 'user',
  avatar_url VARCHAR(2048) NULL,
  bio VARCHAR(500) NULL,
  interests JSON NULL,
  city VARCHAR(100) NULL,
  country VARCHAR(100) NULL,
  social_links JSON NULL,
  locale VARCHAR(16) NOT NULL DEFAULT 'en-IN',
  visibility JSON NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL,
  INDEX idx_users_phone (phone),
  INDEX idx_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS otp_codes (
  id CHAR(26) PRIMARY KEY,
  target VARCHAR(254) NOT NULL,
  purpose ENUM('register','login','reset') NOT NULL,
  code CHAR(6) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_otp_target (target, purpose, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id CHAR(26) PRIMARY KEY,
  user_id CHAR(26) NOT NULL,
  token VARCHAR(128) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  revoked TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  INDEX idx_rt_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS idempotency_keys (
  `key` VARCHAR(64) PRIMARY KEY,
  scope VARCHAR(64) NOT NULL,
  status_code SMALLINT NOT NULL,
  body JSON NOT NULL,
  created_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
