-- Run this in the Supabase SQL Editor

ALTER TABLE check_ins ALTER COLUMN building_id DROP NOT NULL;
ALTER TABLE check_ins ADD COLUMN IF NOT EXISTS custom_location TEXT;
