-- Run this in the Supabase SQL Editor

ALTER TABLE hangouts ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;

-- Backfill existing rows
UPDATE hangouts SET ends_at = planned_at + INTERVAL '2 hours' WHERE ends_at IS NULL;

ALTER TABLE hangouts ALTER COLUMN ends_at SET NOT NULL;
