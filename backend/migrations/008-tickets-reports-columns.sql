-- 008: schema. Events monitor/attendee/top-event reads need tickets.event_id,
-- tickets.holder_name, tickets.avatar_url; admin report resolve writes
-- reports.action_note. All nullable: no rewrite, no lock beyond metadata.
ALTER TABLE tickets
  ADD COLUMN event_id CHAR(26) NULL,
  ADD COLUMN holder_name VARCHAR(100) NULL,
  ADD COLUMN avatar_url VARCHAR(2048) NULL,
  ADD INDEX idx_tickets_event (event_id);
ALTER TABLE reports ADD COLUMN action_note VARCHAR(500) NULL;
