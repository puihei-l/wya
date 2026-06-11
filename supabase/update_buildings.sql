-- Run this in the Supabase SQL Editor

-- Add new columns
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS num_floors INTEGER;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS floor_label TEXT DEFAULT 'Floor';
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS notable_spots TEXT[];

-- Clear existing data (cascades to check_ins, building_edits, etc.)
TRUNCATE buildings CASCADE;
