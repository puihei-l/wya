-- Run this in the Supabase SQL Editor

-- Drop the broken insert policy
DROP POLICY IF EXISTS "check_in_groups: owner insert" ON check_in_groups;

-- Create a security-definer function that verifies ownership then inserts.
-- Runs as the DB owner, bypassing RLS, but enforces ownership in code.
CREATE OR REPLACE FUNCTION link_check_in_to_groups(p_check_in_id UUID, p_group_ids UUID[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM check_ins WHERE id = p_check_in_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO check_in_groups (check_in_id, group_id)
  SELECT p_check_in_id, unnest(p_group_ids)
  ON CONFLICT DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION link_check_in_to_groups TO authenticated;
