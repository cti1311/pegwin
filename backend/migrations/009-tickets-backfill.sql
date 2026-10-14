-- 009: data backfill for 008 (separate from DDL per rollout safety).
-- Existing tickets inherit event_id from their order and holder_name from
-- the attendee captured at checkout.
UPDATE tickets t JOIN orders o ON o.id = t.order_id
  SET t.event_id = o.event_id WHERE t.event_id IS NULL;
UPDATE tickets SET holder_name = attendee_name
  WHERE holder_name IS NULL AND attendee_name IS NOT NULL;
