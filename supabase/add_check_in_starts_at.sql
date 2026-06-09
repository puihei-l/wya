-- Run this in the Supabase SQL Editor

ALTER TABLE check_ins ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;
-- NULL means the check-in started immediately (now), a value means it's scheduled for later
