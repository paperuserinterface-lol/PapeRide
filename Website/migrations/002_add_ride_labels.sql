-- ============================================================================
-- TBRide :: 002_add_ride_labels.sql
-- Human readable pickup/dropoff labels. The Telegram bot sends the addresses
-- its riders type ("Amir Temur Ave -> Tashkent Station"); web riders simply
-- leave them NULL and the dashboards fall back to coordinates.
-- ============================================================================

ALTER TABLE ride_requests ADD COLUMN IF NOT EXISTS pickup_label VARCHAR(160);
ALTER TABLE ride_requests ADD COLUMN IF NOT EXISTS dropoff_label VARCHAR(160);
