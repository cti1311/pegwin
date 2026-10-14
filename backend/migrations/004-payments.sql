CREATE TABLE IF NOT EXISTS payments (
  id CHAR(26) PRIMARY KEY,
  order_id CHAR(26) NOT NULL,
  user_id CHAR(26) NOT NULL,
  amount INT NOT NULL DEFAULT 0,
  method VARCHAR(16) NOT NULL,
  gateway VARCHAR(16) NOT NULL,
  gateway_order_id VARCHAR(128) NOT NULL,
  gateway_event_id VARCHAR(128) NULL,
  status ENUM('pending','success','failed','refunded','partially_refunded') NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 1,
  created_at VARCHAR(32) NOT NULL,
  confirmed_at VARCHAR(32) NULL,
  INDEX idx_payments_order (order_id),
  INDEX idx_payments_user (user_id)
);
CREATE TABLE IF NOT EXISTS payment_methods (
  id CHAR(26) PRIMARY KEY,
  user_id CHAR(26) NOT NULL,
  type ENUM('card','upi') NOT NULL,
  brand VARCHAR(32) NULL,
  last4 CHAR(4) NULL,
  upi_id VARCHAR(128) NULL,
  gateway_token VARCHAR(255) NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at VARCHAR(32) NOT NULL,
  INDEX idx_pm_user (user_id)
);
CREATE TABLE IF NOT EXISTS billing_info (
  user_id CHAR(26) PRIMARY KEY,
  full_name VARCHAR(100) NULL,
  address VARCHAR(500) NULL,
  city VARCHAR(100) NULL,
  state VARCHAR(100) NULL,
  pincode CHAR(6) NULL
);
CREATE TABLE IF NOT EXISTS refunds (
  id CHAR(26) PRIMARY KEY,
  payment_id CHAR(26) NOT NULL,
  amount INT NOT NULL,
  reason VARCHAR(500) NOT NULL,
  status ENUM('pending','processed','failed') NOT NULL DEFAULT 'pending',
  created_at VARCHAR(32) NOT NULL,
  INDEX idx_refunds_payment (payment_id)
);
CREATE TABLE IF NOT EXISTS payouts (
  id CHAR(26) PRIMARY KEY,
  event_id CHAR(26) NULL,
  host_id CHAR(26) NOT NULL,
  net_amount INT NOT NULL DEFAULT 0,
  discount_bearer_share INT NOT NULL DEFAULT 0,
  status ENUM('pending','processing','paid','failed') NOT NULL DEFAULT 'pending',
  eta VARCHAR(32) NULL,
  reference VARCHAR(100) NULL,
  download_url VARCHAR(2048) NULL,
  issued_at VARCHAR(32) NULL,
  created_at VARCHAR(32) NOT NULL,
  INDEX idx_payouts_host (host_id),
  INDEX idx_payouts_event (event_id)
);
CREATE TABLE IF NOT EXISTS payout_accounts (
  id CHAR(26) PRIMARY KEY,
  host_id CHAR(26) NOT NULL,
  bank_name VARCHAR(100) NOT NULL,
  last4 CHAR(4) NOT NULL,
  ifsc CHAR(11) NOT NULL,
  holder VARCHAR(100) NOT NULL,
  method VARCHAR(32) NOT NULL DEFAULT 'Bank Account',
  status ENUM('pending','verified','failed','disconnected') NOT NULL DEFAULT 'pending',
  created_at VARCHAR(32) NOT NULL,
  INDEX idx_pa_host (host_id)
);
CREATE TABLE IF NOT EXISTS tax_info (
  host_id CHAR(26) PRIMARY KEY,
  profile JSON NOT NULL,
  updated_at VARCHAR(32) NOT NULL
);
CREATE TABLE IF NOT EXISTS checkins (
  id CHAR(26) PRIMARY KEY,
  event_id CHAR(26) NOT NULL,
  ticket_code CHAR(12) NOT NULL UNIQUE,
  tier_id CHAR(26) NULL,
  attendee JSON NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'qr_generated',
  scanned_at VARCHAR(32) NULL,
  checked_in_at VARCHAR(32) NULL,
  updated_at VARCHAR(32) NOT NULL,
  INDEX idx_checkins_event (event_id)
);
