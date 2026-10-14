-- 007-hosts: host profile rows backing GET /admin/hosts/flagged and
-- POST /admin/hosts/:hostId/* (identity/payout verification, warn/suspend/remove).
-- Forward-only addition: no earlier migration is edited.
CREATE TABLE IF NOT EXISTS hosts (
  id CHAR(26) PRIMARY KEY,
  user_id CHAR(26) NOT NULL UNIQUE,
  identity_status ENUM('unverified','pending','verified','rejected') NOT NULL DEFAULT 'unverified',
  payout_status ENUM('unverified','pending','verified','rejected') NOT NULL DEFAULT 'unverified',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL,
  INDEX idx_hosts_user (user_id),
  INDEX idx_hosts_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
