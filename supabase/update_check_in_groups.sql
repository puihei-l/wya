-- Run this in the Supabase SQL Editor

CREATE OR REPLACE FUNCTION update_check_in_groups(p_check_in_id UUID, p_group_ids UUID[])
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

  DELETE FROM check_in_groups WHERE check_in_id = p_check_in_id;

  IF array_length(p_group_ids, 1) > 0 THEN
    INSERT INTO check_in_groups (check_in_id, group_id)
    SELECT p_check_in_id, unnest(p_group_ids)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION update_check_in_groups TO authenticated;
