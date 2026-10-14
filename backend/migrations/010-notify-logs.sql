-- 010-notify-logs: per-send email audit (provider reconciliation).
-- Push delivery is best-effort via FCM and logged to app logs only.
CREATE TABLE IF NOT EXISTS email_logs (
  id CHAR(26) PRIMARY KEY,
  recipient VARCHAR(254) NOT NULL,
  subject VARCHAR(300) NOT NULL,
  provider VARCHAR(20) NOT NULL,
  status ENUM('sent','failed','skipped') NOT NULL,
  error VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email_logs_recipient (recipient, created_at)
);
