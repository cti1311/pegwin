-- 003-ticketing.sql: tiers, holds, hold_items, coupons, orders, order_items, tickets.
-- IDs: ULID CHAR(26) server-generated. Money: INT paise, INR only.

CREATE TABLE IF NOT EXISTS tiers (
  id CHAR(26) PRIMARY KEY,
  event_id CHAR(26) NOT NULL,
  name VARCHAR(80) NOT NULL,
  price INT NOT NULL DEFAULT 0,
  capacity INT NOT NULL,
  sold_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tiers_event (event_id),
  CONSTRAINT chk_tiers_price CHECK (price >= 0),
  CONSTRAINT chk_tiers_capacity CHECK (capacity BETWEEN 1 AND 1000000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS holds (
  id CHAR(26) PRIMARY KEY,
  event_id CHAR(26) NOT NULL,
  user_id CHAR(26),
  status ENUM('active','consumed','released','expired') NOT NULL DEFAULT 'active',
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_holds_status_exp (status, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hold_items (
  id CHAR(26) PRIMARY KEY,
  hold_id CHAR(26) NOT NULL,
  tier_id CHAR(26) NOT NULL,
  qty INT NOT NULL,
  unit_price INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_hold_items_hold FOREIGN KEY (hold_id) REFERENCES holds(id) ON DELETE CASCADE,
  INDEX idx_hold_items_hold (hold_id),
  INDEX idx_hold_items_tier (tier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS coupons (
  id CHAR(26) PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  discount_type ENUM('flat','pct') NOT NULL,
  value INT NOT NULL,
  event_id CHAR(26),
  tier_id CHAR(26),
  max_uses INT,
  used_count INT NOT NULL DEFAULT 0,
  valid_from DATETIME,
  valid_to DATETIME,
  discount_bearer ENUM('host','pegwin','split') NOT NULL DEFAULT 'pegwin',
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS orders (
  id CHAR(26) PRIMARY KEY,
  user_id CHAR(26),
  event_id CHAR(26) NOT NULL,
  hold_id CHAR(26),
  coupon_id CHAR(26),
  status ENUM('pending','confirmed','cancelled','refunded') NOT NULL DEFAULT 'pending',
  host_price INT NOT NULL DEFAULT 0,
  platform_fee INT NOT NULL DEFAULT 0,
  display_price INT NOT NULL DEFAULT 0,
  discount INT NOT NULL DEFAULT 0,
  taxable_amount INT NOT NULL DEFAULT 0,
  gst INT NOT NULL DEFAULT 0,
  final_payable INT NOT NULL DEFAULT 0,
  payment_id CHAR(26),
  payment_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  idempotency_key VARCHAR(100),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_orders_user (user_id),
  INDEX idx_orders_idem (idempotency_key, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS order_items (
  id CHAR(26) PRIMARY KEY,
  order_id CHAR(26) NOT NULL,
  tier_id CHAR(26) NOT NULL,
  tier_name VARCHAR(80) NOT NULL,
  qty INT NOT NULL,
  unit_price INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  INDEX idx_order_items_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tickets (
  ticket_code CHAR(12) PRIMARY KEY,
  order_id CHAR(26) NOT NULL,
  tier_id CHAR(26) NOT NULL,
  attendee_name VARCHAR(100) NOT NULL,
  attendee_phone VARCHAR(16),
  attendee_email VARCHAR(254),
  qr_payload TEXT NOT NULL,
  status ENUM('pending','confirmed','qr_generated','checked_in','completed','cancelled','refunded','expired') NOT NULL DEFAULT 'pending',
  checked_in_at DATETIME,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tickets_order (order_id),
  CONSTRAINT fk_tickets_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
